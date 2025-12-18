/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type { FactoryContext } from './factory-context.mjs'
import type {
  AnyInjectableType,
  BaseInjectionTokenSchemaType,
  InjectionTokenSchemaType,
  InjectionTokenType,
  OptionalInjectionTokenSchemaType,
} from './injection-token.mjs'
import type { IContainer } from './interfaces/container.interface.mjs'
import type { Registry } from './registry.mjs'
import type { ScopedContainer } from './scoped-container.mjs'
import type { ServiceInstantiator } from './service-instantiator.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { ServiceLocatorManager } from './service-locator-manager.mjs'
import type { ServiceLocator } from './service-locator.mjs'
import type { TokenProcessor } from './token-processor.mjs'

import { InjectableScope } from './enums/index.mjs'
import { DIError, DIErrorCode } from './errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './injection-token.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

/**
 * InstanceResolver handles instance resolution, creation, and lifecycle management.
 * Extracted from ServiceLocator to improve separation of concerns.
 */
export class InstanceResolver {
  constructor(
    private readonly registry: Registry,
    private readonly manager: ServiceLocatorManager,
    private readonly serviceInstantiator: ServiceInstantiator,
    private readonly tokenProcessor: TokenProcessor,
    private readonly logger: Console | null = null,
    private readonly serviceLocator: ServiceLocator,
  ) {}

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
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
      contextContainer,
    )
    if (err) {
      return [err]
    }

    const {
      instanceName,
      validatedArgs,
      actualToken: _actualToken,
      realToken,
    } = data

    const [error, holder] = await this.retrieveOrCreateInstanceByInstanceName(
      instanceName,
      realToken,
      validatedArgs,
      contextContainer,
    )
    if (error) {
      return [error]
    }
    return [undefined, holder.instance]
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
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
      scopedContainer,
    )
    if (err) {
      return [err]
    }

    const {
      instanceName,
      validatedArgs,
      realToken,
    } = data

    // Check if we already have this instance in the scoped container
    const existingHolder = scopedContainer.getRequestInstance(instanceName)
    if (existingHolder) {
      return this.waitForInstanceReady(existingHolder).then(result => {
        if (result[0]) return result
        return [undefined, result[1].instance]
      })
    }

    // Create new instance and store in scoped container
    const [error, holder] = await this.createRequestScopedInstance(
      instanceName,
      realToken,
      validatedArgs,
      scopedContainer,
    )
    if (error) {
      return [error]
    }
    return [undefined, holder.instance]
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

  /**
   * Gets an instance by its instance name, handling all the logic after instance name creation.
   */
  private async retrieveOrCreateInstanceByInstanceName(
    instanceName: string,
    realToken: InjectionToken<any, any>,
    realArgs: any,
    contextContainer: IContainer,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<any>] | [DIError]> {
    // Try to get existing instance
    const existingHolder = await this.tryGetExistingInstance(instanceName)
    if (existingHolder) {
      return existingHolder
    }

    // No existing instance found, create a new one
    const result = await this.createNewInstance(
      instanceName,
      realToken,
      realArgs,
      contextContainer,
    )
    if (result[0]) {
      return [result[0]]
    }

    const [, holder] = result
    return this.waitForInstanceReady(holder)
  }

  /**
   * Attempts to retrieve an existing singleton instance.
   * Returns null if no instance exists and a new one should be created.
   */
  private async tryGetExistingInstance(
    instanceName: string,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [DIError] | null
  > {
    const [error, holder] = this.manager.get(instanceName)

    if (!error) {
      return this.waitForInstanceReady(holder)
    }

    // Handle recovery scenarios
    switch (error.code) {
      case DIErrorCode.InstanceDestroying:
        this.logger?.log(
          `[InstanceResolver] Instance ${instanceName} is being destroyed, waiting...`,
        )
        await holder?.destroyPromise
        // Retry after destruction is complete
        return this.tryGetExistingInstance(instanceName)

      case DIErrorCode.InstanceNotFound:
        return null // Instance doesn't exist, should create new one

      default:
        return [error]
    }
  }

  /**
   * Waits for an instance holder to be ready and returns the appropriate result.
   */
  private async waitForInstanceReady<T>(
    holder: ServiceLocatorInstanceHolder<T>,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<T>] | [DIError]> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        return this.waitForInstanceReady(holder)

      case ServiceLocatorInstanceHolderStatus.Destroying:
        return [DIError.instanceDestroying(holder.name)]

      case ServiceLocatorInstanceHolderStatus.Error:
        return [holder.instance as DIError]

      case ServiceLocatorInstanceHolderStatus.Created:
        return [undefined, holder]

      default:
        return [DIError.instanceNotFound('unknown')]
    }
  }

  /**
   * Creates a new instance for the given token and arguments.
   */
  private async createNewInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    instanceName: string,
    realToken: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.output<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.output<Schema> | undefined
        : undefined,
    contextContainer: IContainer,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createNewInstance() Creating instance for ${instanceName}`,
    )
    if (this.registry.has(realToken)) {
      return this.instantiateServiceFromRegistry<Instance, Schema, any>(
        instanceName,
        realToken,
        args,
        contextContainer,
      )
    } else {
      return [DIError.factoryNotFound(realToken.name.toString())]
    }
  }

  /**
   * Creates a request-scoped instance and stores it in the ScopedContainer.
   */
  private async createRequestScopedInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    instanceName: string,
    realToken: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.output<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.output<Schema> | undefined
        : undefined,
    scopedContainer: ScopedContainer,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>] | [DIError]> {
    this.logger?.log(
      `[InstanceResolver]#createRequestScopedInstance() Creating request-scoped instance for ${instanceName}`,
    )

    if (!this.registry.has(realToken)) {
      return [DIError.factoryNotFound(realToken.name.toString())]
    }

    const ctx = this.createFactoryContext(scopedContainer)
    const record = this.registry.get<Instance, Schema>(realToken)
    const { type } = record

    // Use createCreatingHolder from manager (but we'll store in scoped container)
    const [deferred, holder] = this.manager.createCreatingHolder<Instance>(
      instanceName,
      type,
      InjectableScope.Request,
      ctx.deps,
    )

    // Store in scoped container immediately
    scopedContainer.storeRequestInstance(instanceName, null, holder)

    // Start the instantiation process
    this.serviceInstantiator
      .instantiateService(ctx, record, args)
      .then(async ([error, instance]) => {
        await this.handleInstantiationResult(
          instanceName,
          holder,
          ctx,
          deferred,
          InjectableScope.Request,
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
          InjectableScope.Request,
          error,
        )
      })

    // Wait for the instance to be ready
    const result = await this.waitForInstanceReady(holder)
    return result
  }

  /**
   * Instantiates a service from the registry using the service instantiator.
   */
  private instantiateServiceFromRegistry<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
    Args extends Schema extends BaseInjectionTokenSchemaType
      ? z.output<Schema>
      : Schema extends OptionalInjectionTokenSchemaType
        ? z.output<Schema> | undefined
        : undefined,
  >(
    instanceName: string,
    token: InjectionToken<Instance, Schema>,
    args: Args,
    contextContainer: IContainer,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>]> {
    this.logger?.log(
      `[InstanceResolver]#instantiateServiceFromRegistry(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext(contextContainer)
    let record = this.registry.get<Instance, Schema>(token)
    let { scope, type } = record

    // Use createCreatingHolder from manager
    const [deferred, holder] = this.manager.createCreatingHolder<Instance>(
      instanceName,
      type,
      scope,
      ctx.deps,
    )

    // Start the instantiation process
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
          undefined,
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

    this.storeInstanceByScope(scope, instanceName, holder)
    // @ts-expect-error TS2322 This is correct type
    return [undefined, holder]
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

  /**
   * Stores an instance holder based on its scope.
   */
  private storeInstanceByScope(
    scope: InjectableScope,
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
  ): void {
    switch (scope) {
      case InjectableScope.Singleton:
        this.logger?.debug?.(
          `[InstanceResolver] Setting singleton instance for ${instanceName}`,
        )
        this.manager.set(instanceName, holder)
        break

      case InjectableScope.Transient:
        // Transient instances are not stored anywhere
        break

      case InjectableScope.Request:
        // Request instances are stored in ScopedContainer, not here
        break
    }
  }

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
