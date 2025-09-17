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
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { Injectors } from './utils/index.mjs'

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
import { defaultInjectors } from './injector.mjs'
import { globalRegistry } from './registry.mjs'
import { ServiceInstantiator } from './service-instantiator.mjs'
import { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'
import { getInjectableToken } from './utils/index.mjs'

export class ServiceLocator {
  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager
  private readonly serviceInstantiator: ServiceInstantiator

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
    private readonly injectors: Injectors = defaultInjectors,
  ) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
    this.serviceInstantiator = new ServiceInstantiator(injectors)
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  getEventBus() {
    return this.eventBus
  }

  getManager() {
    return this.manager
  }

  public getInstanceIdentifier(token: AnyInjectableType, args?: any): string {
    const [err, { actualToken, validatedArgs }] =
      this.validateAndResolveTokenArgs(token, args)
    if (err) {
      throw err
    }
    return this.generateInstanceName(actualToken, validatedArgs)
  }

  public async getInstance(
    token: AnyInjectableType,
    args?: any,
    onPrepare?: (data: {
      instanceName: string
      actualToken: InjectionTokenType
      validatedArgs?: any
    }) => void,
  ) {
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
    )
    if (err) {
      return [err]
    }
    const { instanceName, validatedArgs, actualToken, realToken } = data
    if (onPrepare) {
      onPrepare({ instanceName, actualToken, validatedArgs })
    }
    const [error, holder] = await this.retrieveOrCreateInstanceByInstanceName(
      instanceName,
      realToken,
      validatedArgs,
    )
    if (error) {
      return [error]
    }
    return [undefined, holder.instance]
  }

  public async getOrThrowInstance<Instance>(
    token: AnyInjectableType,
    args: any,
  ): Promise<Instance> {
    const [error, instance] = await this.getInstance(token, args)
    if (error) {
      throw error
    }
    return instance
  }

  public getSyncInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: AnyInjectableType,
    args: Schema extends ZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Instance | null {
    const [err, { actualToken, validatedArgs }] =
      this.validateAndResolveTokenArgs(token, args)
    if (err) {
      return null
    }
    const instanceName = this.generateInstanceName(actualToken, validatedArgs)
    const [error, holder] = this.manager.get(instanceName)
    if (error) {
      return null
    }
    return holder.instance as Instance
  }

  invalidate(service: string, round = 1): Promise<any> {
    this.logger?.log(
      `[ServiceLocator]#invalidate(): Starting Invalidating process of ${service}`,
    )
    const toInvalidate = this.manager.filter(
      (holder) => holder.name === service || holder.deps.has(service),
    )
    const promises = []
    for (const [key, holder] of toInvalidate.entries()) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Destroying) {
        this.logger?.trace(
          `[ServiceLocator]#invalidate(): ${key} is already being destroyed`,
        )
        promises.push(holder.destroyPromise)
        continue
      }
      if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
        this.logger?.trace(
          `[ServiceLocator]#invalidate(): ${key} is being created, waiting for creation to finish`,
        )
        promises.push(
          holder.creationPromise?.then(() => {
            if (round > 3) {
              this.logger?.error(
                `[ServiceLocator]#invalidate(): ${key} creation is triggering a new invalidation round, but it is still not created`,
              )
              return
            }
            return this.invalidate(key, round + 1)
          }),
        )
        continue
      }
      // @ts-expect-error TS2322 we are changing the status
      holder.status = ServiceLocatorInstanceHolderStatus.Destroying
      this.logger?.log(
        `[ServiceLocator]#invalidate(): Invalidating ${key} and notifying listeners`,
      )
      // @ts-expect-error TS2322 we are changing the status
      holder.destroyPromise = Promise.all(
        holder.destroyListeners.map((listener) => listener()),
      ).then(async () => {
        this.manager.delete(key)
        await this.emitInstanceEvent(key, 'destroy')
      })
      promises.push(holder.destroyPromise)
    }
    return Promise.all(promises)
  }

  async ready() {
    return Promise.all(
      Array.from(this.manager.filter(() => true)).map(([, holder]) => {
        if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
          return holder.creationPromise?.then(() => null)
        }
        if (holder.status === ServiceLocatorInstanceHolderStatus.Destroying) {
          return holder.destroyPromise.then(() => null)
        }
        return Promise.resolve(null)
      }),
    ).then(() => null)
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Validates and resolves token arguments, handling factory token resolution and validation.
   */
  private validateAndResolveTokenArgs(
    token: AnyInjectableType,
    args?: any,
  ): [
    FactoryTokenNotResolved | UnknownError | undefined,
    { actualToken: InjectionTokenType; validatedArgs?: any },
  ] {
    let actualToken = token as InjectionToken<any, any>
    if (typeof token === 'function') {
      actualToken = getInjectableToken(token)
    }
    let realArgs = args
    if (actualToken instanceof BoundInjectionToken) {
      realArgs = actualToken.value
    } else if (actualToken instanceof FactoryInjectionToken) {
      if (actualToken.resolved) {
        realArgs = actualToken.value
      } else {
        return [new FactoryTokenNotResolved(token.name), { actualToken }]
      }
    }
    if (!actualToken.schema) {
      return [undefined, { actualToken, validatedArgs: realArgs }]
    }
    const validatedArgs = actualToken.schema?.safeParse(realArgs)
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#validateAndResolveTokenArgs(): Error validating args for ${actualToken.name.toString()}`,
        validatedArgs.error,
      )
      return [new UnknownError(validatedArgs.error), { actualToken }]
    }
    return [undefined, { actualToken, validatedArgs: validatedArgs?.data }]
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
      this.validateAndResolveTokenArgs(token, args)
    if (err instanceof UnknownError) {
      return [err]
    } else if (
      (err as any) instanceof FactoryTokenNotResolved &&
      actualToken instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[ServiceLocator]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      await actualToken.resolve(this.createFactoryContext())
      return this.resolveTokenAndPrepareInstanceName(token)
    }
    const instanceName = this.generateInstanceName(actualToken, validatedArgs)
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
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<any>]
    | [UnknownError | FactoryNotFound]
  > {
    const [error, holder] = this.manager.get(instanceName)
    if (!error) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
        await holder.creationPromise
        return this.retrieveOrCreateInstanceByInstanceName(
          instanceName,
          realToken,
          realArgs,
        )
      } else if (
        holder.status === ServiceLocatorInstanceHolderStatus.Destroying
      ) {
        // Should never happen
        return [new UnknownError(ErrorsEnum.InstanceDestroying)]
      }
      return [undefined, holder]
    }
    switch (error.code) {
      case ErrorsEnum.InstanceDestroying:
        this.logger?.log(
          `[ServiceLocator]#retrieveOrCreateInstanceByInstanceName() TTL expired for ${holder?.name}`,
        )
        await holder?.destroyPromise
        //Maybe we already have a new instance
        return this.retrieveOrCreateInstanceByInstanceName(
          instanceName,
          realToken,
          realArgs,
        )

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[ServiceLocator]#retrieveOrCreateInstanceByInstanceName() TTL expired for ${holder?.name}`,
        )
        await this.invalidate(instanceName)
        //Maybe we already have a new instance
        return this.retrieveOrCreateInstanceByInstanceName(
          instanceName,
          realToken,
          realArgs,
        )
      case ErrorsEnum.InstanceNotFound:
        break
      default:
        return [error]
    }
    const result = await this.createNewInstance(
      instanceName,
      realToken,
      realArgs,
    )
    if (result[0]) {
      return [result[0]]
    }
    if (result[1].status === ServiceLocatorInstanceHolderStatus.Creating) {
      await result[1].creationPromise
    }
    if (result[1].status === ServiceLocatorInstanceHolderStatus.Error) {
      return [result[1].instance] as [UnknownError | FactoryNotFound]
    }
    return [undefined, result[1]]
  }

  /**
   * Emits events to listeners for instance lifecycle events.
   */
  private emitInstanceEvent(
    name: string,
    event: 'create' | 'destroy' = 'create',
  ) {
    this.logger?.log(
      `[ServiceLocator]#emitInstanceEvent() Notifying listeners for ${name} with event ${event}`,
    )
    return this.eventBus.emit(name, event)
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
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<Instance>]
    | [FactoryNotFound | UnknownError]
  > {
    this.logger?.log(
      `[ServiceLocator]#createNewInstance() Creating instance for ${instanceName}`,
    )
    if (this.registry.has(realToken)) {
      return this.instantiateServiceFromRegistry<Instance, Schema, any>(
        instanceName,
        realToken,
        args,
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
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>]> {
    this.logger?.log(
      `[ServiceLocator]#instantiateServiceFromRegistry(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext()
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
        holder.destroyListeners = ctx.getDestroyListeners()
        holder.creationPromise = null
        if (error) {
          this.logger?.error(
            `[ServiceLocator]#instantiateServiceFromRegistry(): Error creating instance for ${instanceName}`,
            error,
          )
          holder.status = ServiceLocatorInstanceHolderStatus.Error
          holder.instance = error
          if (scope === InjectableScope.Singleton) {
            setTimeout(() => this.invalidate(instanceName), 10)
          }
          deferred.reject(error)
        } else {
          holder.instance = instance
          holder.status = ServiceLocatorInstanceHolderStatus.Created
          if (ctx.deps.size > 0) {
            ctx.deps.forEach((dependency) => {
              holder.destroyListeners.push(
                this.eventBus.on(dependency, 'destroy', () =>
                  this.invalidate(instanceName),
                ),
              )
            })
          }
          await this.emitInstanceEvent(instanceName)
          deferred.resolve([undefined, instance])
        }
      })
      .catch((error) => {
        this.logger?.error(
          `[ServiceLocator]#instantiateServiceFromRegistry(): Unexpected error creating instance for ${instanceName}`,
          error,
        )
        holder.status = ServiceLocatorInstanceHolderStatus.Error
        holder.instance = error
        holder.creationPromise = null
        if (scope === InjectableScope.Singleton) {
          setTimeout(() => this.invalidate(instanceName), 10)
        }
        deferred.reject(error)
      })

    if (scope === InjectableScope.Singleton) {
      this.logger?.debug(
        `[ServiceLocator]#instantiateServiceFromRegistry(): Setting instance for ${instanceName}`,
      )
      this.manager.set(instanceName, holder)
    }
    // @ts-expect-error TS2322 This is correct type
    return [undefined, holder]
  }

  /**
   * Creates a factory context for dependency injection during service instantiation.
   */
  private createFactoryContext(): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    const destroyListeners = new Set<() => void>()
    const deps = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    function addDestroyListener(listener: () => void) {
      destroyListeners.add(listener)
    }

    function getDestroyListeners() {
      return Array.from(destroyListeners)
    }

    return {
      // @ts-expect-error This is correct type
      async inject(token, args) {
        const [error, instance] = await self.getInstance(
          token,
          args,
          ({ instanceName }) => {
            deps.add(instanceName)
          },
        )
        if (error) {
          throw error
        }
        return instance
      },
      addDestroyListener,
      getDestroyListeners,
      locator: self,
      deps,
    }
  }

  /**
   * Generates a unique instance name based on token and arguments.
   */
  private generateInstanceName(token: InjectionTokenType, args: any) {
    const formattedArgs = args
      ? ':' +
        Object.entries(args ?? {})
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
          .map(([key, value]) => {
            if (typeof value === 'function') {
              return `${key}=fn_${value.name}(${value.length})`
            }
            if (typeof value === 'symbol') {
              return `${key}=${value.toString()}`
            }
            return `${key}=${JSON.stringify(value).slice(0, 40)}`
          })
          .join(',')
          .replaceAll(/"/g, '')
          .replaceAll(/:/g, '=')
      : ''
    return `${token.toString()}${formattedArgs}`
  }
}
