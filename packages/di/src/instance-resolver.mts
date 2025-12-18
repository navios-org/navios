/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type {
  AnyInjectableType,
  InjectionTokenSchemaType,
  InjectionTokenType,
} from './injection-token.mjs'
import type { FactoryContext } from './factory-context.mjs'
import type { IContainer } from './interfaces/container.interface.mjs'
import type { IHolderStorage } from './interfaces/holder-storage.interface.mjs'
import type { Registry } from './registry.mjs'
import type { ScopedContainer } from './scoped-container.mjs'
import type { ServiceInstantiator } from './service-instantiator.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { ServiceLocatorManager } from './service-locator-manager.mjs'
import type { ServiceLocator } from './service-locator.mjs'
import type { TokenProcessor } from './token-processor.mjs'

import { BaseInstanceHolderManager } from './base-instance-holder-manager.mjs'
import { InjectableScope } from './enums/index.mjs'
import { DIError, DIErrorCode } from './errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './injection-token.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'
import { SingletonHolderStorage } from './singleton-holder-storage.mjs'

/**
 * InstanceResolver handles instance resolution, creation, and lifecycle management.
 * Extracted from ServiceLocator to improve separation of concerns.
 *
 * Uses the Storage Strategy pattern to unify singleton and request-scoped resolution.
 */
export class InstanceResolver {
  private readonly singletonStorage: IHolderStorage

  constructor(
    private readonly registry: Registry,
    private readonly manager: ServiceLocatorManager,
    private readonly serviceInstantiator: ServiceInstantiator,
    private readonly tokenProcessor: TokenProcessor,
    private readonly logger: Console | null = null,
    private readonly serviceLocator: ServiceLocator,
  ) {
    this.singletonStorage = new SingletonHolderStorage(manager)
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
   * @param contextContainer The container to use for creating FactoryContext
   */
  async resolveInstance(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
  ): Promise<[undefined, any] | [DIError]> {
    return this.resolveWithStorage(
      token,
      args,
      contextContainer,
      this.singletonStorage,
    )
  }

  /**
   * Resolves a request-scoped instance for a ScopedContainer.
   * The service will be stored in the ScopedContainer's request context.
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
    // Use the cached storage from ScopedContainer
    return this.resolveWithStorage(
      token,
      args,
      scopedContainer,
      scopedContainer.getHolderStorage(),
      scopedContainer,
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
   * @param contextContainer The container for FactoryContext
   * @param storage The storage strategy to use
   * @param scopedContainer Optional scoped container for request-scoped services
   */
  private async resolveWithStorage(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
    storage: IHolderStorage,
    scopedContainer?: ScopedContainer,
  ): Promise<[undefined, any] | [DIError]> {
    // Step 1: Resolve token and prepare instance name
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
      contextContainer,
    )
    if (err) {
      return [err]
    }

    const { instanceName, validatedArgs, realToken } = data

    // Step 2: Check for existing holder SYNCHRONOUSLY (no await between check and store)
    // This is critical for preventing race conditions with concurrent resolution
    const getResult = storage.get(instanceName)

    if (getResult !== null) {
      const [error, holder] = getResult
      if (!error && holder) {
        // Found existing holder - wait for it to be ready
        const readyResult = await this.waitForInstanceReady(holder)
        if (readyResult[0]) {
          return [readyResult[0]]
        }
        return [undefined, readyResult[1].instance]
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
    )
    if (createError) {
      return [createError]
    }

    return [undefined, holder.instance]
  }

  /**
   * Handles storage error states (destroying, error, etc.).
   * Returns a result if handled, null if should proceed with creation.
   */
  private async handleStorageError(
    instanceName: string,
    error: DIError,
    holder: ServiceLocatorInstanceHolder | undefined,
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
          const readyResult = await this.waitForInstanceReady(newResult[1]!)
          if (readyResult[0]) {
            return [readyResult[0]]
          }
          return [undefined, readyResult[1].instance]
        }
        return null // Proceed with creation

      default:
        return [error]
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
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createAndStoreInstance() Creating instance for ${instanceName}`,
    )

    if (!this.registry.has(realToken)) {
      return [DIError.factoryNotFound(realToken.name.toString())]
    }

    const ctx = this.createFactoryContext(contextContainer)
    const record = this.registry.get<Instance, any>(realToken)
    const { scope, type } = record

    // For transient services, don't use storage locking - create directly
    if (scope === InjectableScope.Transient) {
      return this.createTransientInstance(instanceName, record, args, ctx)
    }

    // Create holder in "Creating" state using registry scope, not storage scope
    const [deferred, holder] = this.manager.createCreatingHolder<Instance>(
      instanceName,
      type,
      scope,
      ctx.deps,
    )

    // Store holder immediately (for lock mechanism)
    storage.set(instanceName, holder)

    // Start async instantiation
    this.serviceInstantiator
      .instantiateService(ctx, record, args)
      .then(async ([error, instance]) => {
        await this.handleInstantiationResult(
          instanceName,
          holder,
          ctx,
          deferred,
          scope,
          error,
          instance,
          scopedContainer,
        )
      })
      .catch(async (error) => {
        await this.handleInstantiationError(
          instanceName,
          holder,
          deferred,
          scope,
          error,
        )
      })

    // Wait for instance to be ready
    return this.waitForInstanceReady(holder)
  }

  /**
   * Creates a transient instance without storage or locking.
   * Each call creates a new instance.
   */
  private async createTransientInstance<Instance>(
    instanceName: string,
    record: any,
    args: any,
    ctx: FactoryContext & { deps: Set<string>; getDestroyListeners: () => (() => void)[] },
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createTransientInstance() Creating transient instance for ${instanceName}`,
    )

    const [error, instance] = await this.serviceInstantiator.instantiateService(
      ctx,
      record,
      args,
    )

    if (error) {
      return [error as DIError]
    }

    // Create a holder for the transient instance (not stored, just for return consistency)
    const holder: ServiceLocatorInstanceHolder<Instance> = {
      status: ServiceLocatorInstanceHolderStatus.Created,
      name: instanceName,
      instance: instance as Instance,
      creationPromise: null,
      destroyPromise: null,
      type: record.type,
      scope: InjectableScope.Transient,
      deps: ctx.deps,
      destroyListeners: ctx.getDestroyListeners(),
      createdAt: Date.now(),
    }

    return [undefined, holder]
  }

  /**
   * Gets a synchronous instance (for sync operations).
   */
  getSyncInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: AnyInjectableType,
    args: Schema extends ZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.input<Schema> | undefined
        : undefined,
    contextContainer: IContainer,
  ): Instance | null {
    const [err, { actualToken, validatedArgs }] =
      this.tokenProcessor.validateAndResolveTokenArgs(token, args)
    if (err) {
      return null
    }
    const instanceName = this.tokenProcessor.generateInstanceName(
      actualToken,
      validatedArgs,
    )

    // Check if this is a ScopedContainer and the service is request-scoped
    if ('getRequestInstance' in contextContainer) {
      const scopedContainer = contextContainer as ScopedContainer
      const requestHolder = scopedContainer.getRequestInstance(instanceName)
      if (requestHolder) {
        return requestHolder.instance as Instance
      }
    }

    // Try singleton manager
    const [error, holder] = this.manager.get(instanceName)
    if (error) {
      return null
    }
    return holder.instance as Instance
  }

  /**
   * Internal method to resolve token args and create instance name.
   * Handles factory token resolution and validation.
   */
  private async resolveTokenAndPrepareInstanceName(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
  ): Promise<
    | [
        undefined,
        {
          instanceName: string
          validatedArgs: any
          actualToken: InjectionTokenType
          realToken: InjectionToken<any, any>
        },
      ]
    | [DIError]
  > {
    const [err, { actualToken, validatedArgs }] =
      this.tokenProcessor.validateAndResolveTokenArgs(token, args)
    if (err instanceof DIError && err.code === DIErrorCode.UnknownError) {
      return [err]
    } else if (
      err instanceof DIError &&
      err.code === DIErrorCode.FactoryTokenNotResolved &&
      actualToken instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[InstanceResolver]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      await actualToken.resolve(this.createFactoryContext(contextContainer))
      return this.resolveTokenAndPrepareInstanceName(token, undefined, contextContainer)
    }
    const instanceName = this.tokenProcessor.generateInstanceName(
      actualToken,
      validatedArgs,
    )
    // Determine the real token (the actual InjectionToken that will be used for resolution)
    const realToken =
      actualToken instanceof BoundInjectionToken ||
      actualToken instanceof FactoryInjectionToken
        ? actualToken.token
        : actualToken
    return [undefined, { instanceName, validatedArgs, actualToken, realToken }]
  }

  // ============================================================================
  // INSTANTIATION HANDLERS
  // ============================================================================

  /**
   * Waits for an instance holder to be ready and returns the appropriate result.
   * Uses the shared utility from BaseInstanceHolderManager.
   */
  private waitForInstanceReady<T>(
    holder: ServiceLocatorInstanceHolder<T>,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<T>] | [DIError]> {
    return BaseInstanceHolderManager.waitForHolderReady(holder)
  }

  /**
   * Handles the result of service instantiation.
   */
  private async handleInstantiationResult(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: FactoryContext & {
      deps: Set<string>
      getDestroyListeners: () => (() => void)[]
    },
    deferred: any,
    scope: InjectableScope,
    error: any,
    instance: any,
    scopedContainer?: ScopedContainer,
  ): Promise<void> {
    holder.destroyListeners = ctx.getDestroyListeners()
    holder.creationPromise = null

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
      )
    }
  }

  /**
   * Handles successful service instantiation.
   */
  private async handleInstantiationSuccess(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: FactoryContext & {
      deps: Set<string>
      getDestroyListeners: () => (() => void)[]
    },
    deferred: any,
    instance: any,
    scopedContainer?: ScopedContainer,
  ): Promise<void> {
    holder.instance = instance
    holder.status = ServiceLocatorInstanceHolderStatus.Created

    // Set up dependency invalidation listeners
    if (ctx.deps.size > 0) {
      ctx.deps.forEach((dependency: string) => {
        holder.destroyListeners.push(
          this.serviceLocator.getEventBus().on(dependency, 'destroy', () => {
            this.logger?.log(
              `[InstanceResolver] Dependency ${dependency} destroyed, invalidating ${instanceName}`,
            )
            this.serviceLocator.getServiceInvalidator().invalidate(instanceName)
          }),
        )

        // For request-scoped services, also listen with prefixed event name
        if (scopedContainer) {
          const prefixedDependency = scopedContainer.getPrefixedEventName(dependency)
          holder.destroyListeners.push(
            this.serviceLocator.getEventBus().on(prefixedDependency, 'destroy', () => {
              this.logger?.log(
                `[InstanceResolver] Request-scoped dependency ${dependency} destroyed, invalidating ${instanceName}`,
              )
              // For request-scoped, we need to invalidate within the scoped container
              scopedContainer.invalidate(instance)
            }),
          )
        }
      })
    }

    // Note: Event emission would need access to the event bus
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
    holder: ServiceLocatorInstanceHolder<any>,
    deferred: any,
    scope: InjectableScope,
    error: any,
  ): Promise<void> {
    this.logger?.error(
      `[InstanceResolver] Error creating instance for ${instanceName}`,
      error,
    )

    holder.status = ServiceLocatorInstanceHolderStatus.Error
    holder.instance = error
    holder.creationPromise = null

    if (scope === InjectableScope.Singleton) {
      this.logger?.log(
        `[InstanceResolver] Singleton ${instanceName} failed, will be invalidated`,
      )
      this.serviceLocator.getServiceInvalidator().invalidate(instanceName)
    }

    deferred.reject(error)
  }

  // ============================================================================
  // FACTORY CONTEXT
  // ============================================================================

  /**
   * Creates a factory context for dependency injection during service instantiation.
   */
  private createFactoryContext(contextContainer: IContainer): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    return this.tokenProcessor.createFactoryContext(contextContainer)
  }
}
