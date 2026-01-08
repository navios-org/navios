/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedContainer } from '../../container/scoped-container.mjs'
import type { IContainer } from '../../interfaces/container.interface.mjs'
import type {
  AnyInjectableType,
  InjectionTokenType,
} from '../../token/injection-token.mjs'
import type { Registry } from '../../token/registry.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'
import type { IHolderStorage } from '../holder/holder-storage.interface.mjs'
import type { InstanceHolder } from '../holder/instance-holder.mjs'
import type { LifecycleEventBus } from '../lifecycle/lifecycle-event-bus.mjs'

import { InjectableScope } from '../../enums/index.mjs'
import { DIError, DIErrorCode } from '../../errors/index.mjs'
import {
  FactoryInjectionToken,
  InjectionToken,
} from '../../token/injection-token.mjs'
import {
  getCurrentResolutionContext,
  withResolutionContext,
} from '../context/resolution-context.mjs'
import { InstanceStatus } from '../holder/instance-holder.mjs'
import { CircularDetector } from '../lifecycle/circular-detector.mjs'
import { NameResolver } from './name-resolver.mjs'
import { ScopeTracker } from './scope-tracker.mjs'
import { ServiceInitializer } from './service-initializer.mjs'
import { ServiceInvalidator } from './service-invalidator.mjs'
import { TokenResolver } from './token-resolver.mjs'

/**
 * Resolves instances from tokens, handling caching, creation, and scope rules.
 *
 * Uses unified storage for both singleton and request-scoped services.
 * Coordinates with ServiceInitializer for actual service creation.
 * Integrates ScopeTracker for automatic scope upgrades.
 */
export class InstanceResolver {
  constructor(
    private readonly registry: Registry,
    private readonly storage: IHolderStorage,
    private readonly serviceInitializer: ServiceInitializer,
    private readonly tokenResolver: TokenResolver,
    private readonly nameResolver: NameResolver,
    private readonly scopeTracker: ScopeTracker,
    private readonly serviceInvalidator: ServiceInvalidator,
    private readonly eventBus: LifecycleEventBus,
    private readonly logger: Console | null = null,
  ) {}

  // ============================================================================
  // PUBLIC RESOLUTION METHODS
  // ============================================================================

  /**
   * Resolves an instance for the given token and arguments.
   * This method is used for singleton and transient services.
   *
   * @param token The injection token
   * @param args Optional arguments
   * @param contextContainer The container to use for creating context
   * @param requestStorage Optional request storage (for scope upgrades)
   * @param requestId Optional request ID (for scope upgrades)
   */
  async resolveInstance(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): Promise<[undefined, any] | [DIError]> {
    return this.resolveWithStorage(
      token,
      args,
      contextContainer,
      this.storage,
      undefined,
      requestStorage,
      requestId,
    )
  }

  /**
   * Resolves a request-scoped instance for a ScopedContainer.
   * The service will be stored in the ScopedContainer's request storage.
   *
   * @param token The injection token
   * @param args Optional arguments
   * @param scopedContainer The ScopedContainer that owns the request context
   */
  async resolveRequestScopedInstance(
    token: AnyInjectableType,
    args: any,
    scopedContainer: ScopedContainer,
  ): Promise<[undefined, any] | [DIError]> {
    return this.resolveWithStorage(
      token,
      args,
      scopedContainer.getParent(),
      scopedContainer.getParent().getStorage(),
      scopedContainer,
      scopedContainer.getStorage(),
      scopedContainer.getRequestId(),
    )
  }

  // ============================================================================
  // UNIFIED RESOLUTION (Storage Strategy Pattern)
  // ============================================================================

  /**
   * Unified resolution method that works with any IHolderStorage.
   * This eliminates duplication between singleton and request-scoped resolution.
   *
   * IMPORTANT: The check-and-store logic is carefully designed to avoid race conditions.
   * The storage check and holder creation must happen synchronously (no awaits between).
   *
   * @param token The injection token
   * @param args Optional arguments
   * @param contextContainer The container for context
   * @param storage The storage strategy to use
   * @param scopedContainer Optional scoped container for request-scoped services
   * @param requestStorage Optional request storage (for scope upgrades)
   * @param requestId Optional request ID (for scope upgrades)
   */
  private async resolveWithStorage(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
    storage: IHolderStorage,
    scopedContainer?: ScopedContainer,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): Promise<[undefined, any] | [DIError]> {
    // Step 1: Resolve token and prepare instance name
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
      contextContainer,
      requestId,
      scopedContainer,
    )
    if (err) {
      return [err]
    }

    const { instanceName, validatedArgs, realToken, scope } = data!

    // Step 2: Check for existing holder SYNCHRONOUSLY (no await between check and store)
    // This is critical for preventing race conditions with concurrent resolution
    const getResult =
      storage.get(instanceName) ?? requestStorage?.get(instanceName) ?? null

    // Create getHolder function for circular dependency detection
    const getHolder = (name: string): InstanceHolder | undefined => {
      // Check both storages
      const result = storage.get(name)
      if (result && result[0] === undefined && result[1]) {
        return result[1]
      }
      if (requestStorage) {
        const reqResult = requestStorage.get(name)
        if (reqResult && reqResult[0] === undefined && reqResult[1]) {
          return reqResult[1]
        }
      }
      return undefined
    }

    if (getResult !== null) {
      const [error, holder] = getResult
      if (!error && holder) {
        // Found existing holder - wait for it to be ready
        // Try to get waiterHolder from resolution context if available
        const resolutionCtx = getCurrentResolutionContext()
        const waiterHolder = resolutionCtx?.waiterHolder
        const readyResult = await this.waitForInstanceReady(
          holder,
          waiterHolder,
          getHolder,
        )
        if (readyResult[0]) {
          return [readyResult[0]]
        }
        return [undefined, readyResult[1]!.instance]
      }
      // Handle error states (destroying, etc.)
      if (error) {
        const handledResult = await this.handleStorageError(
          instanceName,
          error,
          holder,
          storage,
        )
        if (handledResult) {
          return handledResult
        }
      }
    }

    // Step 3: Create new instance and store it
    // NOTE: Holder is stored synchronously inside createAndStoreInstance before any await
    const [createError, holder] = await this.createAndStoreInstance(
      instanceName,
      realToken,
      validatedArgs,
      contextContainer,
      storage,
      scopedContainer,
      requestStorage,
      requestId,
      scope,
    )
    if (createError) {
      return [createError]
    }

    return [undefined, holder!.instance]
  }

  /**
   * Internal method to resolve token args and create instance name.
   * Handles factory token resolution and validation.
   */
  private async resolveTokenAndPrepareInstanceName(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
    requestId?: string,
    scopedContainer?: ScopedContainer,
  ): Promise<
    | [
        undefined,
        {
          instanceName: string
          validatedArgs: any
          actualToken: InjectionTokenType
          realToken: InjectionToken<any, any>
          scope: InjectableScope
        },
      ]
    | [DIError]
  > {
    const [err, { actualToken, validatedArgs }] =
      this.tokenResolver.validateAndResolveTokenArgs(token, args)
    if (
      err instanceof DIError &&
      err.code === DIErrorCode.TokenValidationError
    ) {
      return [err]
    } else if (
      err instanceof DIError &&
      err.code === DIErrorCode.FactoryTokenNotResolved &&
      actualToken instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[InstanceResolver]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      // Create a simple factory context for resolving the factory token
      const factoryCtx = {
        inject: async (t: any, a?: any) =>
          (scopedContainer ?? contextContainer).get(t, a),
        container: scopedContainer ?? contextContainer,
        addDestroyListener: () => {},
      }
      await actualToken.resolve(factoryCtx as any)
      return this.resolveTokenAndPrepareInstanceName(
        token,
        undefined,
        contextContainer,
        requestId,
        scopedContainer,
      )
    }

    // Get the real token for registry lookup
    const realToken = this.tokenResolver.getRealToken(actualToken)
    // Get scope from registry
    const record = this.registry.get(realToken)
    const scope = record.scope

    // Generate instance name with requestId if needed
    const instanceName = this.nameResolver.generateInstanceName(
      actualToken,
      validatedArgs,
      requestId,
      scope,
    )

    return [
      undefined,
      { instanceName, validatedArgs, actualToken, realToken, scope },
    ]
  }

  /**
   * Handles storage error states (destroying, error, etc.).
   * Returns a result if handled, null if should proceed with creation.
   */
  private async handleStorageError(
    instanceName: string,
    error: DIError,
    holder: InstanceHolder | undefined,
    storage: IHolderStorage,
  ): Promise<[undefined, any] | [DIError] | null> {
    switch (error.code) {
      case DIErrorCode.InstanceDestroying:
        // Wait for destruction then retry
        this.logger?.log(
          `[InstanceResolver] Instance ${instanceName} is being destroyed, waiting...`,
        )
        if (holder?.destroyPromise) {
          await holder.destroyPromise
        }
        // Re-check after destruction
        const newResult = storage.get(instanceName)
        if (newResult !== null && !newResult[0]) {
          // Create getHolder for circular dependency detection
          const getHolder = (name: string): InstanceHolder | undefined => {
            const result = storage.get(name)
            return result && result[0] === undefined && result[1]
              ? result[1]
              : undefined
          }
          const readyResult = await this.waitForInstanceReady(
            newResult[1]!,
            undefined,
            getHolder,
          )
          if (readyResult[0]) {
            return [readyResult[0]]
          }
          return [undefined, readyResult[1]!.instance]
        }
        return null // Proceed with creation

      default:
        // For error states, remove the failed holder from storage so we can retry
        if (holder) {
          this.logger?.log(
            `[InstanceResolver] Removing failed instance ${instanceName} from storage to allow retry`,
          )
          storage.delete(instanceName)
        }
        return null // Proceed with creation
    }
  }

  /**
   * Creates a new instance and stores it using the provided storage strategy.
   * This unified method replaces instantiateServiceFromRegistry and createRequestScopedInstance.
   *
   * For transient services, the instance is created but not stored (no caching).
   */
  private async createAndStoreInstance<Instance>(
    instanceName: string,
    realToken: InjectionToken<Instance, any>,
    args: any,
    contextContainer: IContainer,
    storage: IHolderStorage,
    scopedContainer?: ScopedContainer,
    requestStorage?: IHolderStorage,
    requestId?: string,
    scope?: InjectableScope,
  ): Promise<[undefined, InstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createAndStoreInstance() Creating instance for ${instanceName}`,
    )

    if (!this.registry.has(realToken)) {
      return [DIError.factoryNotFound(realToken.name.toString())]
    }

    const record = this.registry.get<Instance, any>(realToken)
    const { type, scope: recordScope } = record
    const serviceScope = scope || recordScope

    // For transient services, don't use storage locking - create directly
    if (serviceScope === InjectableScope.Transient) {
      return this.createTransientInstance(
        instanceName,
        record,
        args,
        contextContainer,
        scopedContainer,
        requestStorage,
        requestId,
      )
    }
    if (serviceScope === InjectableScope.Request && !requestStorage) {
      return [
        DIError.initializationError(
          `Request storage is required for request-scoped services`,
          instanceName,
        ),
      ]
    }

    let storageToUse: IHolderStorage
    if (serviceScope === InjectableScope.Request) {
      storageToUse = requestStorage!
    } else {
      storageToUse = storage
    }

    // Create holder in "Creating" state
    const [deferred, holder] = storageToUse.createHolder<Instance>(
      instanceName,
      type,
      new Set(),
    )
    // Store holder immediately (for lock mechanism)
    storageToUse.set(instanceName, holder)

    // Create context for service initialization
    const ctx = this.createServiceInitializationContext(
      scopedContainer ?? contextContainer,
      instanceName,
      serviceScope,
      holder.deps,
      realToken,
      requestStorage,
      requestId,
    )

    holder.destroyListeners = ctx.getDestroyListeners()

    // Create getHolder function for resolution context
    const getHolder = (name: string): InstanceHolder | undefined => {
      // Check both storages
      const result = storage.get(name)
      if (result && result[0] === undefined && result[1]) {
        return result[1]
      }
      if (requestStorage) {
        const reqResult = requestStorage.get(name)
        if (reqResult && reqResult[0] === undefined && reqResult[1]) {
          return reqResult[1]
        }
      }
      return undefined
    }

    // Start async instantiation within resolution context for circular dependency detection
    withResolutionContext(holder, getHolder, () => {
      this.serviceInitializer
        .instantiateService(ctx, record, args)
        .then(async (result: [undefined, Instance] | [DIError]) => {
          const [error, instance] =
            result.length === 2 ? result : [result[0], undefined]
          const newScope = record.scope
          const newName = this.nameResolver.generateInstanceName(
            realToken,
            args,
            requestId,
            newScope,
          )
          await this.handleInstantiationResult(
            newName,
            holder,
            ctx,
            deferred,
            newScope,
            error,
            instance,
            scopedContainer,
            requestStorage,
            requestId,
          )
        })
        .catch(async (error: Error) => {
          const newScope = record.scope
          const newName = this.nameResolver.generateInstanceName(
            realToken,
            args,
            requestId,
            newScope,
          )

          await this.handleInstantiationError(
            newName,
            holder,
            deferred,
            newScope,
            error,
          )
        })
        .catch(() => {
          // Suppress unhandled rejections from the async chain.
          // Errors are communicated to awaiters via deferred.reject() which
          // rejects holder.creationPromise. This catch is a safety net for
          // any errors that might occur in the error handling itself.
        })
    })

    // Wait for instance to be ready
    // Use resolution context to get waiterHolder if available
    const resolutionCtx = getCurrentResolutionContext()
    const waiterHolder = resolutionCtx?.waiterHolder
    return this.waitForInstanceReady(holder, waiterHolder, getHolder)
  }

  /**
   * Creates a transient instance without storage or locking.
   * Each call creates a new instance.
   */
  private async createTransientInstance<Instance>(
    instanceName: string,
    record: any,
    args: any,
    contextContainer: IContainer,
    scopedContainer?: ScopedContainer,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): Promise<[undefined, InstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createTransientInstance() Creating transient instance for ${instanceName}`,
    )

    // Create a temporary holder for resolution context (transient instances can still have deps)
    const ctx = this.createServiceInitializationContext(
      scopedContainer ?? contextContainer,
      instanceName,
      InjectableScope.Transient,
      new Set(),
      record.originalToken,
      requestStorage,
      requestId,
    )

    const [error, instance] = await this.serviceInitializer.instantiateService(
      ctx,
      record,
      args,
    )

    if (error) {
      return [error]
    }

    // Create a temporary holder for the result
    const tempHolder: InstanceHolder<Instance> = {
      status: InstanceStatus.Created,
      name: instanceName,
      instance: instance as Instance,
      creationPromise: null,
      destroyPromise: null,
      type: record.type,
      scope: InjectableScope.Transient,
      deps: ctx.dependencies,
      destroyListeners: ctx.getDestroyListeners(),
      createdAt: Date.now(),
      waitingFor: new Set(),
    }

    return [undefined, tempHolder]
  }

  /**
   * Handles successful service instantiation.
   */
  private async handleInstantiationSuccess(
    instanceName: string,
    holder: InstanceHolder<any>,
    ctx: ServiceInitializationContext,
    deferred: any,
    instance: any,
    _scopedContainer?: ScopedContainer,
    requestStorage?: IHolderStorage,
    _requestId?: string,
  ): Promise<void> {
    holder.instance = instance
    holder.status = InstanceStatus.Created

    // Set up dependency subscriptions for event-based invalidation
    // Determine which storage to use for subscriptions
    const storageForSubscriptions = requestStorage || this.storage

    // Set up subscriptions via ServiceInvalidator
    if (ctx.dependencies.size > 0) {
      this.serviceInvalidator.setupDependencySubscriptions(
        instanceName,
        ctx.dependencies,
        storageForSubscriptions,
        holder,
      )
    }

    this.logger?.log(
      `[InstanceResolver] Instance ${instanceName} created successfully`,
    )
    deferred.resolve([undefined, instance])
  }

  /**
   * Handles service instantiation errors.
   */
  private async handleInstantiationError(
    instanceName: string,
    holder: InstanceHolder<any>,
    deferred: any,
    scope: InjectableScope,
    error: any,
  ): Promise<void> {
    holder.status = InstanceStatus.Error
    holder.instance = error instanceof DIError ? error : DIError.unknown(error)
    this.logger?.error(
      `[InstanceResolver] Instance ${instanceName} creation failed:`,
      error,
    )
    deferred.reject(error instanceof DIError ? error : DIError.unknown(error))
  }

  /**
   * Handles instantiation result (success or error).
   */
  private async handleInstantiationResult(
    instanceName: string,
    holder: InstanceHolder<any>,
    ctx: ServiceInitializationContext,
    deferred: any,
    scope: InjectableScope,
    error: any,
    instance: any,
    scopedContainer?: ScopedContainer,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): Promise<void> {
    if (error) {
      await this.handleInstantiationError(
        instanceName,
        holder,
        deferred,
        scope,
        error,
      )
    } else {
      await this.handleInstantiationSuccess(
        instanceName,
        holder,
        ctx,
        deferred,
        instance,
        scopedContainer,
        requestStorage,
        requestId,
      )
    }
  }

  /**
   * Waits for an instance holder to be ready and returns the appropriate result.
   *
   * @param holder The holder to wait for
   * @param waiterHolder Optional holder that is doing the waiting (for circular dependency detection)
   * @param getHolder Optional function to retrieve holders by name (required if waiterHolder is provided)
   */
  private async waitForInstanceReady<T>(
    holder: InstanceHolder<T>,
    waiterHolder?: InstanceHolder,
    getHolder?: (name: string) => InstanceHolder | undefined,
  ): Promise<[undefined, InstanceHolder<T>] | [DIError]> {
    switch (holder.status) {
      case InstanceStatus.Creating: {
        // Check for circular dependency before waiting
        if (waiterHolder && getHolder) {
          const cycle = CircularDetector.detectCycle(
            waiterHolder.name,
            holder.name,
            getHolder,
          )
          if (cycle) {
            return [DIError.circularDependency(cycle)]
          }

          if (process.env.NODE_ENV !== 'production') {
            // Track the waiting relationship
            waiterHolder.waitingFor.add(holder.name)
          }
        }

        try {
          await holder.creationPromise
        } finally {
          if (process.env.NODE_ENV !== 'production') {
            // Clean up the waiting relationship
            if (waiterHolder) {
              waiterHolder.waitingFor.delete(holder.name)
            }
          }
        }

        // Recursively check after creation completes
        return this.waitForInstanceReady(holder, waiterHolder, getHolder)
      }

      case InstanceStatus.Destroying:
        return [DIError.instanceDestroying(holder.name)]

      case InstanceStatus.Error:
        return [holder.instance as unknown as DIError]

      case InstanceStatus.Created:
        return [undefined, holder]

      default:
        // @ts-expect-error Maybe we will use this in the future
        return [DIError.instanceNotFound(holder?.name ?? 'unknown')]
    }
  }

  /**
   * Creates a ServiceInitializationContext for service instantiation.
   */
  private createServiceInitializationContext(
    container: IContainer,
    serviceName: string,
    scope: InjectableScope,
    deps: Set<string>,
    serviceToken: InjectionToken<any, any>,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): ServiceInitializationContext {
    const destroyListeners: Array<() => void> = []

    return {
      inject: async (token: any, args?: any) => {
        // Track dependency and check for scope upgrade
        const actualToken =
          typeof token === 'function'
            ? this.tokenResolver.normalizeToken(token)
            : token
        const realToken = this.tokenResolver.getRealToken(actualToken)
        const depRecord = this.registry.get(realToken)
        const depScope = depRecord.scope

        // Generate dependency name - if dependency is Request-scoped and we have requestId, use it
        const dependencyRequestId =
          depScope === InjectableScope.Request ? requestId : undefined
        const finalDepName = this.nameResolver.generateInstanceName(
          actualToken,
          args,
          dependencyRequestId,
          depScope,
        )

        // Check if current service needs scope upgrade
        // If current service is Singleton and dependency is Request, upgrade current service
        if (
          scope === InjectableScope.Singleton &&
          depScope === InjectableScope.Request &&
          requestStorage &&
          requestId
        ) {
          // Check and perform scope upgrade for current service
          // Use the dependency name with requestId for the check
          const [needsUpgrade, newServiceName] =
            this.scopeTracker.checkAndUpgradeScope(
              serviceName,
              scope,
              finalDepName,
              depScope,
              serviceToken,
              this.storage,
              requestStorage,
              requestId,
            )

          if (needsUpgrade && newServiceName) {
            // Service was upgraded - update the service name in context
            // The holder will be moved to request storage by ScopeTracker
            // For now, we continue with the current resolution
            // Future resolutions will use the new name
          }
        }

        // Track dependency
        deps.add(finalDepName)

        // Resolve dependency
        // Resolution context is automatically used by the injectors system for circular dependency detection
        return container.get(token, args)
      },
      container,
      addDestroyListener: (listener: () => void) => {
        destroyListeners.push(listener)
      },
      getDestroyListeners: () => destroyListeners,
      serviceName,
      dependencies: deps,
      scope,
      trackDependency: (name: string, depScope: InjectableScope) => {
        deps.add(name)
        // Check for scope upgrade
        if (
          scope === InjectableScope.Singleton &&
          depScope === InjectableScope.Request &&
          requestStorage &&
          requestId
        ) {
          this.scopeTracker.checkAndUpgradeScope(
            serviceName,
            scope,
            name,
            depScope,
            serviceToken,
            this.storage,
            requestStorage,
            requestId,
          )
        }
      },
    }
  }
}
