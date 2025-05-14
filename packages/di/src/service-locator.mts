/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { AnyZodObject, z, ZodOptional } from 'zod'

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
  ServiceLocatorInstanceHolderKind,
  ServiceLocatorInstanceHolderStatus,
} from './service-locator-instance-holder.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'
import { getInjectableToken } from './utils/index.mjs'

export class ServiceLocator {
  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
  ) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
  }

  getEventBus() {
    return this.eventBus
  }

  public storeInstance<Instance>(
    instance: Instance,
    token: BoundInjectionToken<Instance, any>,
  ): void
  public storeInstance<Instance>(
    instance: Instance,
    token: FactoryInjectionToken<Instance, any>,
  ): void
  public storeInstance<Instance>(
    instance: Instance,
    token: InjectionToken<Instance, undefined>,
  ): void
  public storeInstance<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject>,
  >(
    instance: Instance,
    token: InjectionToken<Instance, Schema>,
    args: z.input<Schema>,
  ): void
  public storeInstance(
    instance: any,
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ): void {
    // @ts-expect-error We should redefine the instance name type
    const instanceName = this.getInstanceIdentifier(token, args)
    this.manager.set(instanceName, {
      name: instanceName,
      instance,
      status: ServiceLocatorInstanceHolderStatus.Created,
      kind: ServiceLocatorInstanceHolderKind.Instance,
      createdAt: Date.now(),
      ttl: Infinity,
      deps: [],
      destroyListeners: [],
      effects: [],
      destroyPromise: null,
      creationPromise: null,
    })
    this.notifyListeners(instanceName)
  }

  public removeInstance<Instance>(
    token: BoundInjectionToken<Instance, any>,
  ): void
  public removeInstance<Instance>(
    token: FactoryInjectionToken<Instance, any>,
  ): void
  public removeInstance<Instance>(
    token: InjectionToken<Instance, undefined>,
  ): void
  public removeInstance<Instance, Schema extends BaseInjectionTokenSchemaType>(
    token: InjectionToken<Instance, Schema>,
    args: z.input<Schema>,
  ): void
  public removeInstance<
    Instance,
    Schema extends OptionalInjectionTokenSchemaType,
  >(token: InjectionToken<Instance, Schema>, args?: z.input<Schema>): void

  public removeInstance(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ) {
    // @ts-expect-error We should redefine the instance name type
    const instanceName = this.getInstanceIdentifier(token, args)
    return this.invalidate(instanceName)
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
        `[ServiceLocator]#getInstance(): Error validating args for ${token.name.toString()}`,
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
    const [err, realArgs] = this.resolveTokenArgs(token as any, args)
    if (err instanceof UnknownError) {
      return [err]
    } else if (
      (err as any) instanceof FactoryTokenNotResolved &&
      token instanceof FactoryInjectionToken
    ) {
      await token.resolve()
      // @ts-expect-error TS2322 We should redefine the instance name type
      return this.getInstance(token, args)
    }
    const instanceName = this.makeInstanceName(token, realArgs)
    const [error, holder] = this.manager.get(instanceName)
    if (!error) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
        return holder.creationPromise
      } else if (
        holder.status === ServiceLocatorInstanceHolderStatus.Destroying
      ) {
        // Should never happen
        return [new UnknownError(ErrorsEnum.InstanceDestroying)]
      }
      return [undefined, holder.instance]
    }
    switch (error.code) {
      case ErrorsEnum.InstanceDestroying:
        this.logger?.log(
          `[ServiceLocator]#getInstance() TTL expired for ${holder?.name}`,
        )
        await holder?.destroyPromise
        //Maybe we already have a new instance
        // @ts-expect-error We should redefine the instance name type
        return this.getInstance(token, args)

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[ServiceLocator]#getInstance() TTL expired for ${holder?.name}`,
        )
        await this.invalidate(instanceName)
        //Maybe we already have a new instance
        // @ts-expect-error We should redefine the instance name type
        return this.getInstance(token, args)
      case ErrorsEnum.InstanceNotFound:
        break
      default:
        return [error]
    }
    // @ts-expect-error TS2322 It's validated
    return this.createInstance(instanceName, token, realArgs)
  }

  public async getOrThrowInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
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
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Promise<[undefined, Instance] | [FactoryNotFound | UnknownError]> {
    this.logger?.log(
      `[ServiceLocator]#createInstance() Creating instance for ${instanceName}`,
    )
    let realToken =
      token instanceof BoundInjectionToken ||
      token instanceof FactoryInjectionToken
        ? token.token
        : token
    if (this.registry.has(realToken)) {
      return this.resolveInstance(instanceName, realToken, args)
    } else {
      return [new FactoryNotFound(realToken.name.toString())]
    }
  }

  private async resolveInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
    Args extends Schema extends BaseInjectionTokenSchemaType
      ? z.input<Schema>
      : Schema extends OptionalInjectionTokenSchemaType
        ? z.input<Schema> | undefined
        : undefined,
  >(
    instanceName: string,
    token: InjectionToken<Instance, Schema>,
    args: Args,
  ): Promise<[undefined, Instance] | [FactoryNotFound]> {
    this.logger?.log(
      `[ServiceLocator]#resolveInstance(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext(instanceName)
    let { factory, scope } = this.registry.get<Instance, Schema>(token)
    const holder: ServiceLocatorInstanceHolder<Instance> = {
      name: instanceName,
      instance: null,
      status: ServiceLocatorInstanceHolderStatus.Creating,
      kind: ServiceLocatorInstanceHolderKind.AbstractFactory,
      // @ts-expect-error TS2322 This is correct type
      creationPromise: factory(ctx, args)
        .then(async (instance: Instance) => {
          holder.instance = instance
          holder.status = ServiceLocatorInstanceHolderStatus.Created
          holder.deps = ctx.getDependencies()
          holder.destroyListeners = ctx.getDestroyListeners()
          holder.ttl = ctx.getTtl()
          if (holder.deps.length > 0) {
            this.logger?.log(
              `[ServiceLocator]#createInstanceFromAbstractFactory(): Adding subscriptions for ${instanceName} dependencies for their invalidations: ${holder.deps.join(
                ', ',
              )}`,
            )
            holder.deps.forEach((dependency) => {
              holder.destroyListeners.push(
                this.eventBus.on(dependency, 'destroy', () =>
                  this.invalidate(instanceName),
                ),
              )
            })
          }
          if (holder.ttl === 0 || scope === InjectableScope.Instance) {
            // One time instance
            await this.invalidate(instanceName)
          }
          await this.notifyListeners(instanceName)
          return [undefined, instance as Instance]
        })
        .catch((error) => {
          this.logger?.error(
            `[ServiceLocator]#createInstanceFromAbstractFactory(): Error creating instance for ${instanceName}`,
            error,
          )
          return [new UnknownError(error)]
        }),
      effects: [],
      deps: [],
      destroyListeners: [],
      createdAt: Date.now(),
      ttl: Infinity,
    }

    if (scope === InjectableScope.Singleton) {
      this.manager.set(instanceName, holder)
    }
    // @ts-expect-error TS2322 This is correct type
    return holder.creationPromise
  }

  private createFactoryContext(instanceName: string): FactoryContext {
    const dependencies = new Set<string>()
    const destroyListeners = new Set<() => void>()
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    function invalidate(name = instanceName) {
      return self.invalidate(name)
    }
    function addEffect(listener: () => void) {
      destroyListeners.add(listener)
    }
    let ttl = Infinity
    function setTtl(value: number) {
      ttl = value
    }
    function getTtl() {
      return ttl
    }

    function on(key: string, event: string, listener: (event: string) => void) {
      destroyListeners.add(self.eventBus.on(key, event, listener))
    }

    return {
      // @ts-expect-error This is correct type
      async inject(token, args) {
        let injectionToken = token
        if (typeof token === 'function') {
          injectionToken = getInjectableToken(token)
        }
        if (injectionToken instanceof InjectionToken) {
          const validatedArgs = token.schema
            ? token.schema.safeParse(args)
            : undefined
          const instanceName = self.makeInstanceName(token, validatedArgs)
          dependencies.add(instanceName)
          return self.getOrThrowInstance(injectionToken, args as any)
        }
        throw new Error(
          `[ServiceLocator]#inject(): Invalid token type: ${typeof token}. Expected a class or an InjectionToken.`,
        )
      },
      invalidate,
      on: on as ServiceLocatorEventBus['on'],
      getDependencies: () => Array.from(dependencies),
      addEffect,
      getDestroyListeners: () => Array.from(destroyListeners),
      setTtl,
      getTtl,
      locator: self,
    }
  }

  public getSyncInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
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
      (holder) => holder.name === service || holder.deps.includes(service),
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
        JSON.stringify(args, (_, value) => {
          if (typeof value === 'function') {
            return `function:${value.name}(${value.length})`
          }
          if (typeof value === 'symbol') {
            return value.toString()
          }
          return value
        })
          .replaceAll(/"/g, '')
          .replaceAll(/:/g, '=')
          .replaceAll(/,/g, '|')
      : ''
    return `${token.toString()}${formattedArgs}`
  }
}
