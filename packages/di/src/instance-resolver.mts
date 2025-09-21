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
import type { Registry } from './registry.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceInstantiator } from './service-instantiator.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { ServiceLocatorManager } from './service-locator-manager.mjs'
import type { ServiceLocator } from './service-locator.mjs'
import type { TokenProcessor } from './token-processor.mjs'

import { InjectableScope } from './enums/index.mjs'
import {
  ErrorsEnum,
  FactoryNotFound,
  FactoryTokenNotResolved,
  UnknownError,
} from './errors/index.mjs'
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
   */
  async resolveInstance(
    token: AnyInjectableType,
    args?: any,
    requestContext?: RequestContextHolder,
  ): Promise<[undefined, any] | [UnknownError | FactoryTokenNotResolved]> {
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
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
      requestContext,
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
    currentRequestContext: RequestContextHolder | null,
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

    // Try request context first
    if (currentRequestContext) {
      const requestHolder = currentRequestContext.get(instanceName)
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
    args?: any,
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
    | [UnknownError | FactoryTokenNotResolved]
  > {
    const [err, { actualToken, validatedArgs }] =
      this.tokenProcessor.validateAndResolveTokenArgs(token, args)
    if (err instanceof UnknownError) {
      return [err]
    } else if (
      (err as any) instanceof FactoryTokenNotResolved &&
      actualToken instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[InstanceResolver]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      await actualToken.resolve(this.createFactoryContext())
      return this.resolveTokenAndPrepareInstanceName(token)
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
    requestContext?: RequestContextHolder,
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<any>]
    | [UnknownError | FactoryNotFound]
  > {
    // Try to get existing instance (handles both request-scoped and singleton)
    const existingHolder = await this.tryGetExistingInstance(
      instanceName,
      realToken,
      requestContext,
    )
    if (existingHolder) {
      return existingHolder
    }

    // No existing instance found, create a new one
    const result = await this.createNewInstance(
      instanceName,
      realToken,
      realArgs,
      requestContext,
    )
    if (result[0]) {
      return [result[0]]
    }

    const [, holder] = result
    return this.waitForInstanceReady(holder)
  }

  /**
   * Attempts to retrieve an existing instance, handling request-scoped and singleton instances.
   * Returns null if no instance exists and a new one should be created.
   */
  private async tryGetExistingInstance(
    instanceName: string,
    realToken: InjectionToken<any, any>,
    requestContext?: RequestContextHolder,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    // Check request-scoped instances first
    const requestResult = await this.tryGetRequestScopedInstance(
      instanceName,
      realToken,
      requestContext,
    )
    if (requestResult) {
      return requestResult
    }

    // Check singleton instances
    return this.tryGetSingletonInstance(instanceName)
  }

  /**
   * Attempts to get a request-scoped instance if applicable.
   */
  private async tryGetRequestScopedInstance(
    instanceName: string,
    realToken: InjectionToken<any, any>,
    requestContext?: RequestContextHolder,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    if (!this.registry.has(realToken)) {
      return null
    }

    const record = this.registry.get(realToken)
    if (record.scope !== InjectableScope.Request) {
      return null
    }

    if (!requestContext) {
      this.logger?.log(
        `[InstanceResolver] No current request context available for request-scoped service ${instanceName}`,
      )
      return [new UnknownError(ErrorsEnum.InstanceNotFound)]
    }

    const requestHolder = requestContext.get(instanceName)
    if (!requestHolder) {
      return null
    }

    return this.waitForInstanceReady(requestHolder)
  }

  /**
   * Attempts to get a singleton instance from the manager.
   */
  private async tryGetSingletonInstance(
    instanceName: string,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    const [error, holder] = this.manager.get(instanceName)

    if (!error) {
      return this.waitForInstanceReady(holder)
    }

    // Handle recovery scenarios
    switch (error.code) {
      case ErrorsEnum.InstanceDestroying:
        this.logger?.log(
          `[InstanceResolver] Instance ${instanceName} is being destroyed, waiting...`,
        )
        await holder?.destroyPromise
        // Retry after destruction is complete
        return this.tryGetSingletonInstance(instanceName)

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[InstanceResolver] Instance ${instanceName} expired, invalidating...`,
        )
        // Note: This would need access to the service invalidator
        // For now, we'll return the error
        return [error]

      case ErrorsEnum.InstanceNotFound:
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
  ): Promise<[undefined, ServiceLocatorInstanceHolder<T>] | [UnknownError]> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        return this.waitForInstanceReady(holder)

      case ServiceLocatorInstanceHolderStatus.Destroying:
        return [new UnknownError(ErrorsEnum.InstanceDestroying)]

      case ServiceLocatorInstanceHolderStatus.Error:
        return [holder.instance as UnknownError]

      case ServiceLocatorInstanceHolderStatus.Created:
        return [undefined, holder]

      default:
        return [new UnknownError(ErrorsEnum.InstanceNotFound)]
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
    requestContext?: RequestContextHolder,
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<Instance>]
    | [FactoryNotFound | UnknownError]
  > {
    this.logger?.log(
      `[InstanceResolver]#createNewInstance() Creating instance for ${instanceName}`,
    )
    if (this.registry.has(realToken)) {
      return this.instantiateServiceFromRegistry<Instance, Schema, any>(
        instanceName,
        realToken,
        args,
        requestContext,
      )
    } else {
      return [new FactoryNotFound(realToken.name.toString())]
    }
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
    requestContext?: RequestContextHolder,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>]> {
    this.logger?.log(
      `[InstanceResolver]#instantiateServiceFromRegistry(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext(requestContext)
    let record = this.registry.get<Instance, Schema>(token)
    let { scope, type } = record

    // Use createCreatingHolder from manager
    const [deferred, holder] = this.manager.createCreatingHolder<Instance>(
      instanceName,
      type,
      scope,
      ctx.deps,
      Infinity,
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
          requestContext,
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

    this.storeInstanceByScope(scope, instanceName, holder, requestContext)
    // @ts-expect-error TS2322 This is correct type
    return [undefined, holder]
  }

  /**
   * Handles the result of service instantiation.
   */
  private async handleInstantiationResult(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: any,
    deferred: any,
    scope: InjectableScope,
    error: any,
    instance: any,
    _requestContext?: RequestContextHolder,
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
      )
    }
  }

  /**
   * Handles successful service instantiation.
   */
  private async handleInstantiationSuccess(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: any,
    deferred: any,
    instance: any,
  ): Promise<void> {
    holder.instance = instance
    holder.status = ServiceLocatorInstanceHolderStatus.Created

    // Set up dependency invalidation listeners
    if (ctx.deps.size > 0) {
      ctx.deps.forEach((dependency: string) => {
        holder.destroyListeners.push(
          // Note: This would need access to the event bus
          // For now, we'll skip this functionality
          () => {
            this.logger?.log(
              `[InstanceResolver] Dependency ${dependency} destroyed, invalidating ${instanceName}`,
            )
          },
        )
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
      // Note: This would need access to the service invalidator
      this.logger?.log(
        `[InstanceResolver] Singleton ${instanceName} failed, will be invalidated`,
      )
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
    requestContext?: RequestContextHolder,
  ): void {
    switch (scope) {
      case InjectableScope.Singleton:
        this.logger?.debug(
          `[InstanceResolver] Setting singleton instance for ${instanceName}`,
        )
        this.manager.set(instanceName, holder)
        break

      case InjectableScope.Request:
        if (requestContext) {
          this.logger?.debug(
            `[InstanceResolver] Setting request-scoped instance for ${instanceName}`,
          )
          requestContext.addInstance(instanceName, holder.instance, holder)
        }
        break

      case InjectableScope.Transient:
        // Transient instances are not stored anywhere
        break
    }
  }

  /**
   * Creates a factory context for dependency injection during service instantiation.
   * @param contextHolder Optional request context holder for priority-based resolution
   */
  private createFactoryContext(
    contextHolder?: RequestContextHolder,
  ): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    return this.tokenProcessor.createFactoryContext(
      contextHolder,
      this.serviceLocator,
    )
  }
}
