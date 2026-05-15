import { InjectableScope } from '../../enums/index.mjs'
import { DIError, DIErrorCode } from '../../errors/index.mjs'
import { FactoryToken, Token } from '../../token/token.mjs'
import {
  getCurrentResolutionContext,
  withResolutionContext,
} from '../context/resolution-context.mjs'
import { InstanceStatus } from '../holder/instance-holder.mjs'
import { CircularDetector } from '../lifecycle/circular-detector.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedContainer } from '../../container/scoped-container.mjs'
import type { IContainer } from '../../interfaces/container.interface.mjs'
import type { CreateContext, PluginRegistry } from '../../plugin/index.mjs'
import type { AnyInjectableType, TokenType } from '../../token/token.mjs'
import type { FactoryRecord, Registry } from '../../token/registry.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'
import type { IHolderStorage } from '../holder/holder-storage.interface.mjs'
import type { InstanceHolder } from '../holder/instance-holder.mjs'
import type { LifecycleEventBus } from '../lifecycle/lifecycle-event-bus.mjs'

import { NameResolver } from './name-resolver.mjs'
import { ServiceInitializer } from './service-initializer.mjs'
import { ServiceInvalidator } from './service-invalidator.mjs'
import { TokenResolver } from './token-resolver.mjs'

/**
 * Resolves instances from tokens, handling caching, creation, and scope rules.
 *
 * Uses unified storage for both singleton and request-scoped services.
 * Coordinates with ServiceInitializer for actual service creation.
 */
export class InstanceResolver {
  constructor(
    private readonly registry: Registry,
    private readonly storage: IHolderStorage,
    private readonly serviceInitializer: ServiceInitializer,
    private readonly tokenResolver: TokenResolver,
    private readonly nameResolver: NameResolver,
    private readonly serviceInvalidator: ServiceInvalidator,
    private readonly eventBus: LifecycleEventBus,
    private readonly pluginRegistry: PluginRegistry | null = null,
    private readonly logger: Console | null = null,
  ) {}

  /**
   * Builds the plugin {@link CreateContext} for a construction. Only ever
   * called on the construction path (never a cache hit), so middleware/hooks
   * fire exactly when an instance is actually built — once per singleton,
   * every time for transients.
   */
  private buildCreateContext(
    realToken: Token<any, any>,
    record: FactoryRecord,
    args: any,
    instanceName: string,
    scope: InjectableScope,
    contextContainer: IContainer,
    requestId?: string,
  ): CreateContext {
    return {
      token: realToken as Token<unknown>,
      target: record.target,
      scope,
      args,
      instanceName,
      container: contextContainer,
      requestId,
    }
  }

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
   * @param requestStorage Optional request storage (for request-scoped resolution)
   * @param requestId Optional request ID (for request-scoped resolution)
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
   * @param requestStorage Optional request storage (for request-scoped resolution)
   * @param requestId Optional request ID (for request-scoped resolution)
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
    const getResult = storage.get(instanceName) ?? requestStorage?.get(instanceName) ?? null

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
        const readyResult = await this.waitForInstanceReady(holder, waiterHolder, getHolder)
        if (readyResult[0]) {
          return [readyResult[0]]
        }
        return [undefined, readyResult[1]!.instance]
      }
      // Handle error states (destroying, etc.)
      if (error) {
        const handledResult = await this.handleStorageError(instanceName, error, holder, storage)
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
          actualToken: TokenType
          realToken: Token<any, any>
          scope: InjectableScope
        },
      ]
    | [DIError]
  > {
    const [err, { actualToken, validatedArgs }] = this.tokenResolver.validateAndResolveTokenArgs(
      token,
      args,
    )
    if (err instanceof DIError && err.code === DIErrorCode.TokenValidationError) {
      return [err]
    } else if (
      err instanceof DIError &&
      err.code === DIErrorCode.FactoryTokenNotResolved &&
      actualToken instanceof FactoryToken
    ) {
      this.logger?.log(
        `[InstanceResolver]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      // Create a simple factory context for resolving the factory token
      const factoryCtx = {
        inject: async (t: any, a?: any) => (scopedContainer ?? contextContainer).get(t, a),
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

    return [undefined, { instanceName, validatedArgs, actualToken, realToken, scope }]
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
            return result && result[0] === undefined && result[1] ? result[1] : undefined
          }
          const readyResult = await this.waitForInstanceReady(newResult[1]!, undefined, getHolder)
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
    realToken: Token<Instance, any>,
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
        realToken,
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
    const [deferred, holder] = storageToUse.createHolder<Instance>(instanceName, type, new Set())
    // Store holder immediately (for lock mechanism)
    storageToUse.set(instanceName, holder)

    // Create context for service initialization
    const ctx = this.createServiceInitializationContext(
      scopedContainer ?? contextContainer,
      instanceName,
      serviceScope,
      holder.deps,
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

    // Plugin context for this construction. We are guaranteed NOT on a
    // cache-hit path here (resolveWithStorage returns cached holders before
    // ever calling createAndStoreInstance), so middleware/hooks fire exactly
    // once per singleton instance and never on subsequent cached gets.
    const pluginCtx = this.pluginRegistry
      ? this.buildCreateContext(
          realToken,
          record,
          args,
          instanceName,
          serviceScope,
          scopedContainer ?? contextContainer,
          requestId,
        )
      : null

    // core = the real construction. Middleware wraps this; its transformed
    // return becomes what is stored in the holder AND returned (OTEL wrap
    // contract). instantiateService still runs unchanged so the @InjectLazy
    // deferred-thenable + registerDependency cascade is recorded on ctx.deps
    // exactly as before — middleware only wraps the resulting value.
    const core = async (): Promise<Instance> => {
      const result = await this.serviceInitializer.instantiateService(ctx, record, args)
      const [error, instance] = result.length === 2 ? result : [result[0], undefined]
      if (error) {
        // Throw so the chain rejects → handleInstantiationError. Middleware
        // errors propagate the same way (intentional abort).
        throw error
      }
      return instance as Instance
    }

    const runConstruction = (): Promise<unknown> =>
      this.pluginRegistry && pluginCtx
        ? this.pluginRegistry.runMiddleware(pluginCtx, core)
        : core()

    // Start async instantiation within resolution context for circular dependency detection
    withResolutionContext(holder, getHolder, () => {
      ;(async () => {
        if (this.pluginRegistry && pluginCtx) {
          await this.pluginRegistry.runBeforeCreate(pluginCtx)
        }
        return runConstruction()
      })()
        .then(async (instance: unknown) => {
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
            undefined,
            instance,
            scopedContainer,
            requestStorage,
            requestId,
            pluginCtx,
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

          await this.handleInstantiationError(newName, holder, deferred, newScope, error)
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
    realToken?: Token<any, any>,
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
      requestId,
    )

    // Transient = no caching, so middleware/hooks run on EVERY get (per
    // design §3.3). Same construction-only wiring as the singleton path.
    const pluginCtx =
      this.pluginRegistry && realToken
        ? this.buildCreateContext(
            realToken,
            record as FactoryRecord,
            args,
            instanceName,
            InjectableScope.Transient,
            scopedContainer ?? contextContainer,
            requestId,
          )
        : null

    if (this.pluginRegistry && pluginCtx) {
      await this.pluginRegistry.runBeforeCreate(pluginCtx)
    }

    const core = async (): Promise<unknown> => {
      const [err, built] = await this.serviceInitializer.instantiateService(ctx, record, args)
      if (err) {
        throw err
      }
      return built
    }

    let instance: unknown
    try {
      instance =
        this.pluginRegistry && pluginCtx
          ? await this.pluginRegistry.runMiddleware(pluginCtx, core)
          : await core()
    } catch (err) {
      return [err instanceof DIError ? err : DIError.unknown(err as Error)]
    }

    if (this.pluginRegistry && pluginCtx) {
      await this.pluginRegistry.runAfterCreate(pluginCtx, instance)
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
    pluginCtx?: CreateContext | null,
  ): Promise<void> {
    // `instance` is the post-middleware value (OTEL wrap contract): the
    // holder stores, subscribes-against, and returns the wrapped value, so
    // findByInstance + cascade invalidation operate on exactly what callers
    // received.
    holder.instance = instance
    holder.status = InstanceStatus.Created

    // Set up dependency subscriptions for event-based invalidation
    // Determine which storage to use for subscriptions
    const storageForSubscriptions = requestStorage || this.storage

    // Set up subscriptions via ServiceInvalidator
    // ctx.dependencies is fully populated for ALL injection kinds — eager,
    // optional, AND lazy — because the @InjectLazy deferred path calls
    // ctx.registerDependency() synchronously during resolveInjections (before
    // construction). Lazy edges are therefore included in subscriptions even
    // though their instances resolve only on first field-await. Do NOT move
    // lazy registration into the deferred start() closure — it would be missed
    // here and cascade invalidation would silently break for lazy deps.
    if (ctx.dependencies.size > 0) {
      // Forward the SAME owning-container/requestId used for this holder's
      // create hooks (pluginCtx) as the cascade DestroyContext, so when this
      // holder is later cascade-invalidated (a dependency was invalidated),
      // its runBeforeDestroy/runAfterDestroy fire. Without this the cascade
      // path passes undefined and plugin destroy hooks are silently skipped
      // for every cascade-invalidated dependent.
      const cascadeDestroyContext =
        this.pluginRegistry && pluginCtx
          ? { container: pluginCtx.container, requestId: pluginCtx.requestId }
          : undefined
      this.serviceInvalidator.setupDependencySubscriptions(
        instanceName,
        ctx.dependencies,
        storageForSubscriptions,
        holder,
        cascadeDestroyContext,
      )
    }

    // onAfterCreate observes the fully-stored (post-middleware) instance.
    // Error-isolated inside PluginRegistry: a throwing hook is reported via
    // the container-logger-backed onPluginError and never breaks the get().
    if (this.pluginRegistry && pluginCtx) {
      await this.pluginRegistry.runAfterCreate(pluginCtx, instance)
    }

    this.logger?.log(`[InstanceResolver] Instance ${instanceName} created successfully`)
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
    this.logger?.error(`[InstanceResolver] Instance ${instanceName} creation failed:`, error)
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
    pluginCtx?: CreateContext | null,
  ): Promise<void> {
    if (error) {
      await this.handleInstantiationError(instanceName, holder, deferred, scope, error)
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
        pluginCtx,
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
          const cycle = CircularDetector.detectCycle(waiterHolder.name, holder.name, getHolder)
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
    requestId?: string,
  ): ServiceInitializationContext {
    const destroyListeners: Array<() => void> = []

    // Records the dependency edge (name) WITHOUT resolving the instance.
    // Used by both `inject` (eager path) and `registerDependency` (the
    // @InjectLazy deferred path) so that the dependency is registered in
    // `deps` BEFORE the host's setupDependencySubscriptions runs —
    // preserving event-based cascade invalidation for lazy edges even
    // though the instance itself is resolved later (or never).
    const recordDependencyEdge = (token: any, args?: any): void => {
      const actualToken =
        typeof token === 'function' ? this.tokenResolver.normalizeToken(token) : token
      const realToken = this.tokenResolver.getRealToken(actualToken)
      const depRecord = this.registry.get(realToken)
      const depScope = depRecord.scope

      // Generate dependency name - if dependency is Request-scoped and we have requestId, use it
      const dependencyRequestId = depScope === InjectableScope.Request ? requestId : undefined
      const finalDepName = this.nameResolver.generateInstanceName(
        actualToken,
        args,
        dependencyRequestId,
        depScope,
      )

      // Track dependency
      deps.add(finalDepName)
    }

    return {
      inject: async (token: any, args?: any) => {
        recordDependencyEdge(token, args)

        // Resolve dependency
        // Resolution context is automatically used by the injectors system for circular dependency detection
        return container.get(token, args)
      },
      registerDependency: (token: any, args?: any) => {
        recordDependencyEdge(token, args)
      },
      container,
      addDestroyListener: (listener: () => void) => {
        destroyListeners.push(listener)
      },
      getDestroyListeners: () => destroyListeners,
      serviceName,
      dependencies: deps,
      scope,
    }
  }
}
