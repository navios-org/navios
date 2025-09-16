/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type { FactoryContext } from './factory-context.mjs'
import type {
  BaseInjectionTokenSchemaType,
  InjectionTokenSchemaType,
  OptionalInjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Registry } from './registry.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

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
import { globalRegistry } from './registry.mjs'
import { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import {
  ServiceLocatorInstanceHolderStatus,
} from './service-locator-instance-holder.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'
import { getInjectableToken } from './utils/index.mjs'
import { ServiceInstantiator } from './service-instantiator.mjs'

export class ServiceLocator {
  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager
  private readonly serviceInstantiator: ServiceInstantiator

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
  ) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
    this.serviceInstantiator = new ServiceInstantiator(registry)
  }

  getEventBus() {
    return this.eventBus
  }

  private resolveTokenArgs<
    Instance,
    Schema extends BaseInjectionTokenSchemaType,
  >(
    token: InjectionToken<Instance, Schema>,
    args: z.input<Schema>,
  ): [undefined, z.output<Schema>] | [UnknownError]
  private resolveTokenArgs<
    Instance,
    Schema extends OptionalInjectionTokenSchemaType,
  >(
    token: InjectionToken<Instance, Schema>,
    args?: z.input<Schema>,
  ): [undefined, z.output<Schema>] | [UnknownError]
  private resolveTokenArgs<Instance, Schema extends InjectionTokenSchemaType>(
    token: BoundInjectionToken<Instance, Schema>,
  ): [undefined, z.output<Schema>] | [UnknownError]
  private resolveTokenArgs<Instance, Schema extends InjectionTokenSchemaType>(
    token: FactoryInjectionToken<Instance, Schema>,
  ): [undefined, z.output<Schema>] | [FactoryTokenNotResolved | UnknownError]
  private resolveTokenArgs(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ) {
    let realArgs = args
    if (token instanceof BoundInjectionToken) {
      realArgs = token.value
    } else if (token instanceof FactoryInjectionToken) {
      if (token.resolved) {
        realArgs = token.value
      } else {
        return [new FactoryTokenNotResolved(token.name)]
      }
    }
    if (!token.schema) {
      return [undefined, realArgs]
    }
    const validatedArgs = token.schema?.safeParse(realArgs)
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#resolveTokenArgs(): Error validating args for ${token.name.toString()}`,
        validatedArgs.error,
      )
      return [new UnknownError(validatedArgs.error)]
    }
    return [undefined, validatedArgs?.data]
  }

  public getInstanceIdentifier<
    Instance,
    Schema extends BaseInjectionTokenSchemaType,
  >(token: InjectionToken<Instance, Schema>, args: z.input<Schema>): string
  public getInstanceIdentifier<
    Instance,
    Schema extends OptionalInjectionTokenSchemaType,
  >(token: InjectionToken<Instance, Schema>, args?: z.input<Schema>): string
  public getInstanceIdentifier<Instance>(
    token: InjectionToken<Instance, undefined>,
  ): string
  public getInstanceIdentifier<Instance>(
    token: BoundInjectionToken<Instance, any>,
  ): string
  public getInstanceIdentifier<Instance>(
    token: FactoryInjectionToken<Instance, any>,
  ): string
  public getInstanceIdentifier(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ): string {
    const [err, realArgs] = this.resolveTokenArgs(
      token as InjectionToken<any>,
      args,
    )
    if (err) {
      throw err
    }
    return this.makeInstanceName(token as InjectionToken<any>, realArgs)
  }

  public getInstance<Instance, Schema extends BaseInjectionTokenSchemaType>(
    token: InjectionToken<Instance, Schema>,
    args: z.input<Schema>,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]>
  public getInstance<Instance, Schema extends OptionalInjectionTokenSchemaType>(
    token: InjectionToken<Instance, Schema>,
    args?: z.input<Schema>,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]>
  public getInstance<Instance>(
    token: InjectionToken<Instance, undefined>,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]>
  public getInstance<Instance>(
    token: BoundInjectionToken<Instance, any>,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]>
  public getInstance<Instance>(
    token: FactoryInjectionToken<Instance, any>,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]>

  public async getInstance(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ) {
    const [err, data] = await this.prepareArgsAndName(token, args)
    if (err) {
      return [err]
    }
    const {instanceName, realArgs} = data
    const [error, holder] = await this.getInstanceByInstanceName(instanceName, token, realArgs)
    if (error) {
      return [error]
    }
    return [undefined, holder.instance]
  }

  /**
   * Internal method to resolve token args and create instance name.
   * Handles factory token resolution and validation.
   * @param token The injection token
   * @param args Optional arguments
   * @returns Promise resolving to [error, instanceName, realArgs] or [error] if failed
   */
  private async prepareArgsAndName(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ): Promise<[undefined, {instanceName: string, realArgs: any}] | [UnknownError | FactoryTokenNotResolved]> {
    const [err, realArgs] = this.resolveTokenArgs(token as any, args)
    if (err instanceof UnknownError) {
      return [err]
    } else if (
      (err as any) instanceof FactoryTokenNotResolved &&
      token instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[ServiceLocator]#resolveArgsAndCreateInstanceNameInternal() Factory token not resolved, resolving it`,
      )
      await token.resolve()
      return this.prepareArgsAndName(token)
    }
    const instanceName = this.makeInstanceName(token, realArgs)
    return [undefined, {instanceName, realArgs}]
  }

  /**
   * Gets an instance by its instance name, handling all the logic after instance name creation.
   * @param instanceName The instance name to look up
   * @param token The injection token (for recursive calls)
   * @param realArgs The resolved arguments (for recursive calls)
   * @returns Promise resolving to the instance or error
   */
  private async getInstanceByInstanceName(
    instanceName: string,
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    realArgs: any,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError | FactoryNotFound]> {
    const [error, holder] = this.manager.get(instanceName)
    if (!error) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
        await holder.creationPromise
        return this.getInstanceByInstanceName(instanceName, token, realArgs)
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
          `[ServiceLocator]#getInstanceByInstanceName() TTL expired for ${holder?.name}`,
        )
        await holder?.destroyPromise
        //Maybe we already have a new instance
        return this.getInstanceByInstanceName(instanceName, token, realArgs)

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[ServiceLocator]#getInstanceByInstanceName() TTL expired for ${holder?.name}`,
        )
        await this.invalidate(instanceName)
        //Maybe we already have a new instance
        return this.getInstanceByInstanceName(instanceName, token, realArgs)
      case ErrorsEnum.InstanceNotFound:
        break
      default:
        return [error]
    }
    // @ts-expect-error TS2322 It's validated
    const result = await this.createInstance(instanceName, token, realArgs)
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

  public async getOrThrowInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Promise<Instance> {
    const [error, instance] = await this.getInstance(token, args)
    if (error) {
      throw error
    }
    return instance
  }

  private notifyListeners(
    name: string,
    event: 'create' | 'destroy' = 'create',
  ) {
    this.logger?.log(
      `[ServiceLocator]#notifyListeners() Notifying listeners for ${name} with event ${event}`,
    )
    return this.eventBus.emit(name, event)
  }

  private async createInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    instanceName: string,
    token: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.output<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.output<Schema> | undefined
        : undefined,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>] | [FactoryNotFound | UnknownError]> {
    this.logger?.log(
      `[ServiceLocator]#createInstance() Creating instance for ${instanceName}`,
    )
    let realToken =
      token instanceof BoundInjectionToken ||
      token instanceof FactoryInjectionToken
        ? token.token
        : token
    if (this.registry.has(realToken)) {
      return this.resolveInstance<Instance, Schema, any>(instanceName, realToken, args)
    } else {
      return [new FactoryNotFound(realToken.name.toString())]
    }
  }

  private resolveInstance<
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
      `[ServiceLocator]#resolveInstance(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext(instanceName)
    let record = this.registry.get<Instance, Schema>(token)
    let { scope, type } = record
    const holder: ServiceLocatorInstanceHolder<Instance> = {
      name: instanceName,
      instance: null,
      status: ServiceLocatorInstanceHolderStatus.Creating,
      type,
      scope,
      // @ts-expect-error TS2322 This is correct type
      creationPromise: this.serviceInstantiator.instantiateService(ctx, record, args)
        .then(async (instance: Instance) => {
          holder.instance = instance
          holder.status = ServiceLocatorInstanceHolderStatus.Created
          holder.destroyListeners = ctx.getDestroyListeners()
          holder.ttl = Infinity // Simplified: no TTL management
          if (ctx.deps.size > 0) {
            ctx.deps.forEach((dependency) => {
              holder.destroyListeners.push(
                this.eventBus.on(dependency, 'destroy', () =>
                  this.invalidate(instanceName),
                ),
              )
            })
          }
          await this.notifyListeners(instanceName)
          return [undefined, instance] as [undefined, Instance]
        })
        .catch((error) => {
          this.logger?.error(
            `[ServiceLocator]#createInstanceFromAbstractFactory(): Error creating instance for ${instanceName}`,
            error,
          )
          holder.creationPromise = null
          holder.status = ServiceLocatorInstanceHolderStatus.Error
          holder.instance = error
          if (scope === InjectableScope.Singleton) {
            setTimeout(() => this.invalidate(instanceName), 10)
          }
          return [error]
        }),
      deps: ctx.deps,
      destroyListeners: [],
      createdAt: Date.now(),
      ttl: Infinity,
    }

    if (scope === InjectableScope.Singleton) {
      this.logger?.debug(
        `[ServiceLocator]#resolveInstance(): Setting instance for ${instanceName}`,
      )
      this.manager.set(instanceName, holder)
    }
    // @ts-expect-error TS2322 This is correct type
    return [undefined, holder]
  }

  private createFactoryContext(instanceName: string): FactoryContext & { getDestroyListeners: () => (() => void)[], deps: Set<string> } {
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
        let injectionToken = token
        if (typeof token === 'function') {
          injectionToken = getInjectableToken(token)
        }
        if (injectionToken) {
          const [err, data] = await self.prepareArgsAndName(
            injectionToken,
            args,
          )
          if (err) {
            throw err
          }
          const {instanceName, realArgs} = data
          deps.add(instanceName)
          const [error, holder] = await self.getInstanceByInstanceName(instanceName, injectionToken, realArgs)
          if (error) {
            throw error
          }
          return holder.instance
        }
        throw new Error(
          `[ServiceLocator]#inject(): Invalid token type: ${typeof token}. Expected a class or an InjectionToken.`,
        )
      },
      addDestroyListener,
      getDestroyListeners,
      locator: self,
      deps,
    }
  }

  public getSyncInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Instance | null {
    const [err, realArgs] = this.resolveTokenArgs(token, args)
    if (err) {
      return null
    }
    const instanceName = this.makeInstanceName(token, realArgs)
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
        await this.notifyListeners(key, 'destroy')
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

  makeInstanceName(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args: any,
  ) {
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
