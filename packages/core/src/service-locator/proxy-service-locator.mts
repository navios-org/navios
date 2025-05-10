import type { AnyZodObject, output, z, ZodOptional } from 'zod'

import type { FactoryNotFound, UnknownError } from './index.mjs'
import type { InjectionToken } from './injection-token.mjs'
import type { ServiceLocatorAbstractFactoryContext } from './service-locator-abstract-factory-context.mjs'
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import type { ServiceLocator } from './service-locator.mjs'

// @ts-expect-error We don't need all the properties of the class
export class ProxyServiceLocator implements ServiceLocator {
  constructor(
    private readonly serviceLocator: ServiceLocator,
    private readonly ctx: ServiceLocatorAbstractFactoryContext,
  ) {}
  get abstractFactories(): Map<
    InjectionToken<any, any>,
    (ctx: ServiceLocatorAbstractFactoryContext, args: any) => Promise<any>
  > {
    return this.serviceLocator['abstractFactories']
  }
  getEventBus(): ServiceLocatorEventBus {
    return this.serviceLocator.getEventBus()
  }
  public registerAbstractFactory<
    Instance,
    Schema extends AnyZodObject | undefined,
  >(
    token: InjectionToken<Instance, Schema>,
    factory: (
      ctx: ServiceLocatorAbstractFactoryContext,
      values: Schema extends AnyZodObject ? output<Schema> : undefined,
    ) => Promise<Instance>,
  ): void {
    return this.serviceLocator.registerAbstractFactory(token, factory)
  }
  public getInstance<
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
    return this.ctx.inject(token, args).then(
      (instance) => {
        return [undefined, instance]
      },
      (error) => {
        return [error]
      },
    )
  }
  public getOrThrowInstance<
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
    return this.ctx.inject(token, args)
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
    return this.serviceLocator.getSyncInstance(token, args)
  }
  invalidate(service: string, round?: number): Promise<any> {
    return this.serviceLocator.invalidate(service, round)
  }
  ready(): Promise<null> {
    return this.serviceLocator.ready()
  }
  makeInstanceName(token: InjectionToken<any, any>, args: any): string {
    return this.serviceLocator.makeInstanceName(token, args)
  }
}

export function makeProxyServiceLocator(
  serviceLocator: ServiceLocator,
  ctx: ServiceLocatorAbstractFactoryContext,
): ServiceLocator {
  // @ts-expect-error We don't need all the properties of the class
  return new ProxyServiceLocator(serviceLocator, ctx)
}
