/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { AnyZodObject, z, ZodOptional } from 'zod'

import type { ServiceLocatorAbstractFactoryContext } from './service-locator-abstract-factory-context.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { InjectableScope } from './enums/index.mjs'
import { ErrorsEnum, FactoryNotFound, UnknownError } from './errors/index.mjs'
import { BoundInjectionToken, getInjectableToken } from './index.mjs'
import { InjectionToken } from './injection-token.mjs'
import { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import {
  ServiceLocatorInstanceHolderKind,
  ServiceLocatorInstanceHolderStatus,
} from './service-locator-instance-holder.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'

export class ServiceLocator {
  private abstractFactories: Map<
    InjectionToken<any, any>,
    (ctx: ServiceLocatorAbstractFactoryContext, ...args: any) => Promise<any>
  > = new Map()
  private instanceFactories: Map<
    InjectionToken<any, any>,
    (ctx: ServiceLocatorAbstractFactoryContext, ...args: any) => Promise<any>
  > = new Map()

  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager

  constructor(private readonly logger: Console | null = null) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
  }

  getEventBus() {
    return this.eventBus
  }

  public registerInstance<Instance>(
    token: InjectionToken<Instance, undefined>,
    instance: Instance,
  ): void {
    const instanceName = this.getInstanceIdentifier(token, undefined)
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
  }

  public removeInstance<Instance>(token: InjectionToken<Instance, undefined>) {
    const instanceName = this.getInstanceIdentifier(token, undefined)
    return this.invalidate(instanceName)
  }

  public registerAbstractFactory<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    factory: (
      ctx: ServiceLocatorAbstractFactoryContext,
      values: Schema extends AnyZodObject ? z.output<Schema> : undefined,
    ) => Promise<Instance>,
    type: InjectableScope = InjectableScope.Singleton,
  ) {
    this.logger?.log(
      `[ServiceLocator]#registerAbstractFactory(): Registering abstract factory for ${name}`,
    )
    if (type === InjectableScope.Instance) {
      this.instanceFactories.set(token, factory)
      this.abstractFactories.delete(token)
    } else {
      this.abstractFactories.set(token, factory)
      this.instanceFactories.delete(token)
    }
  }

  public getInstanceIdentifier<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): string {
    const validatedArgs =
      token instanceof BoundInjectionToken
        ? token.schema?.safeParse(token.value)
        : token.schema
          ? token.schema.safeParse(args)
          : undefined
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#getInstance(): Error validating args for ${token.name.toString()}`,
        validatedArgs.error,
      )
      throw new UnknownError(validatedArgs.error)
    }
    return this.makeInstanceName(token, validatedArgs?.data)
  }

  public async getInstance<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Promise<[undefined, Instance] | [UnknownError | FactoryNotFound]> {
    const validatedArgs =
      token instanceof BoundInjectionToken
        ? token.schema?.safeParse(token.value)
        : token.schema
          ? token.schema.safeParse(args)
          : undefined
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#getInstance(): Error validating args for ${token.name.toString()}`,
        validatedArgs.error,
      )
      return [new UnknownError(validatedArgs.error)]
    }
    const instanceName = this.makeInstanceName(token, validatedArgs?.data)
    const [error, holder] = this.manager.get(instanceName)
    if (!error) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Creating) {
        // @ts-expect-error TS2322 We should redefine the instance name type
        return holder.creationPromise
      } else if (
        holder.status === ServiceLocatorInstanceHolderStatus.Destroying
      ) {
        // Should never happen
        return [new UnknownError(ErrorsEnum.InstanceDestroying)]
      }
      // @ts-expect-error We should redefine the instance name type
      return [undefined, holder.instance]
    }
    switch (error.code) {
      case ErrorsEnum.InstanceDestroying:
        this.logger?.log(
          `[ServiceLocator]#getInstance() TTL expired for ${holder?.name}`,
        )
        await holder?.destroyPromise
        //Maybe we already have a new instance
        return this.getInstance<Instance, Schema>(token, args)

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[ServiceLocator]#getInstance() TTL expired for ${holder?.name}`,
        )
        await this.invalidate(instanceName)
        //Maybe we already have a new instance
        return this.getInstance<Instance, Schema>(token, args)
      case ErrorsEnum.InstanceNotFound:
        break
      default:
        return [error]
    }
    // @ts-expect-error TS2322 It's validated
    return this.createInstance(instanceName, token, validatedArgs?.data)
  }

  public async getOrThrowInstance<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
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
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
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
    let realToken = token instanceof BoundInjectionToken ? token.token : token
    if (
      this.abstractFactories.has(realToken) ||
      this.instanceFactories.has(realToken)
    ) {
      return this.createInstanceFromAbstractFactory(
        instanceName,
        realToken,
        args,
      )
    } else {
      return [new FactoryNotFound(realToken.name.toString())]
    }
  }

  private async createInstanceFromAbstractFactory<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
    Args extends Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  >(
    instanceName: string,
    token: InjectionToken<Instance, Schema>,
    args: Args,
  ): Promise<[undefined, Instance] | [FactoryNotFound]> {
    this.logger?.log(
      `[ServiceLocator]#createInstanceFromAbstractFactory(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createContextForAbstractFactory(instanceName)
    let shouldStore = true
    let abstractFactory = this.abstractFactories.get(token)
    if (!abstractFactory) {
      abstractFactory = this.instanceFactories.get(token)
      shouldStore = false
      if (!abstractFactory) {
        return [new FactoryNotFound(token.name.toString())]
      }
    }
    const holder: ServiceLocatorInstanceHolder<Instance> = {
      name: instanceName,
      instance: null,
      status: ServiceLocatorInstanceHolderStatus.Creating,
      kind: ServiceLocatorInstanceHolderKind.AbstractFactory,
      // @ts-expect-error TS2322 This is correct type
      creationPromise: abstractFactory(ctx, args)
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
          if (holder.ttl === 0 || !shouldStore) {
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

    if (shouldStore) {
      this.manager.set(instanceName, holder)
    }
    // @ts-expect-error TS2322 This is correct type
    return holder.creationPromise
  }

  private createContextForAbstractFactory(
    instanceName: string,
  ): ServiceLocatorAbstractFactoryContext {
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
          return self.getOrThrowInstance(injectionToken, args)
        }
        throw new Error(
          `[ServiceLocator]#inject(): Invalid token type: ${typeof token}. Expected a class or an InjectionToken.`,
        )
      },
      invalidate,
      eventBus: self.eventBus,
      on: on as ServiceLocatorEventBus['on'],
      getDependencies: () => Array.from(dependencies),
      addEffect,
      getDestroyListeners: () => Array.from(destroyListeners),
      setTtl,
      getTtl,
    }
  }

  public getSyncInstance<
    Instance,
    Schema extends AnyZodObject | ZodOptional<AnyZodObject> | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    args: Schema extends AnyZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<AnyZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Instance | null {
    const validatedArgs =
      token instanceof BoundInjectionToken
        ? token.schema?.safeParse(token.value)
        : token.schema
          ? token.schema.safeParse(args)
          : undefined
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#getInstance(): Error validating args for ${token.name.toString()}`,
        validatedArgs.error,
      )
      throw new UnknownError(validatedArgs.error)
    }
    const instanceName = this.makeInstanceName(token, validatedArgs?.data)
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

  makeInstanceName(token: InjectionToken<any, any>, args: any) {
    let stringifiedArgs = args
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
    const { name } = token
    if (typeof name === 'function') {
      const className = name.name
      return `${className}(${token.id})${stringifiedArgs}`
    } else if (typeof name === 'symbol') {
      return `${name.toString()}(${token.id})${stringifiedArgs}`
    } else {
      return `${name}(${token.id})${stringifiedArgs}`
    }
  }
}
