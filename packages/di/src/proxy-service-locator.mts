import type { AnyZodObject, z, ZodOptional } from 'zod'

import type { FactoryContext } from './factory-context.mjs'
import type {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './injection-token.mjs'
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import type { ServiceLocator } from './service-locator.mjs'

export class ProxyServiceLocator implements ServiceLocator {
  constructor(
    private readonly serviceLocator: ServiceLocator,
    private readonly ctx: FactoryContext,
  ) {}

  getEventBus(): ServiceLocatorEventBus {
    return this.serviceLocator.getEventBus()
  }

  // @ts-expect-error We don't need all the properties of the class
  public getInstance(
    token:
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: any,
  ) {
    // @ts-expect-error We don't need all the properties of the class
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
  ctx: FactoryContext,
): ServiceLocator {
  // @ts-expect-error We don't need all the properties of the class
  return new ProxyServiceLocator(serviceLocator, ctx)
}
