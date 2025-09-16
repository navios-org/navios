import type { FactoryContext } from './factory-context.mjs'
import type { Registry, FactoryRecord } from './registry.mjs'

import { InjectableType } from './enums/index.mjs'
import { provideFactoryContext, wrapSyncInit } from './injector.mjs'

/**
 * ServiceInstantiator handles the instantiation of services based on registry records.
 * It replaces the hard-coded logic in Injectable and Factory decorators.
 */
export class ServiceInstantiator {
  constructor(private readonly registry: Registry) {}

  /**
   * Instantiates a service based on its registry record.
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service
   * @returns Promise resolving to the instantiated service
   */
  async instantiateService<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any = undefined,
  ): Promise<T> {
    switch (record.type) {
      case InjectableType.Class:
        return this.instantiateClass(ctx, record, args)
      case InjectableType.Factory:
        return this.instantiateFactory(ctx, record, args)
      default:
        throw new Error(
          `[ServiceInstantiator] Unknown service type: ${record.type}`,
        )
    }
  }

  /**
   * Instantiates a class-based service (Injectable decorator).
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service constructor
   * @returns Promise resolving to the instantiated service
   */
  private async instantiateClass<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<T> {
    const tryLoad = wrapSyncInit(() => {
      const original = provideFactoryContext(ctx)
      let result = new record.target(...(args ? [args] : []))
      provideFactoryContext(original)
      return result
    })
    
    let [instance, promises] = tryLoad()
    if (promises.length > 0) {
      await Promise.allSettled(promises)
      const newRes = tryLoad()
      instance = newRes[0]
      promises = newRes[1]
    }
    
    if (promises.length > 0) {
      console.error(`[ServiceInstantiator] ${record.target.name} has problem with it's definition.

     One or more of the dependencies are registered as a InjectableScope.Instance and are used with syncInject.

     Please use inject instead of syncInject to load those dependencies.`)
      throw new Error(
        `[ServiceInstantiator] Service ${record.target.name} cannot be instantiated.`,
      )
    }

    // Handle lifecycle hooks
    if ('onServiceInit' in instance) {
      await (instance as any).onServiceInit()
    }
    if ('onServiceDestroy' in instance) {
      ctx.addDestroyListener(async () => {
        await (instance as any).onServiceDestroy()
      })
    }

    return instance
  }

  /**
   * Instantiates a factory-based service (Factory decorator).
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the factory
   * @returns Promise resolving to the instantiated service
   */
  private async instantiateFactory<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<T> {
    
    const tryLoad = wrapSyncInit(() => {
      const original = provideFactoryContext(ctx)
      let result = new record.target()
      provideFactoryContext(original)
      return result
    })
    
    let [builder, promises] = tryLoad()
    if (promises.length > 0) {
      await Promise.allSettled(promises)
      const newRes = tryLoad()
      builder = newRes[0]
      promises = newRes[1]
    }
    
    if (promises.length > 0) {
      console.error(`[ServiceInstantiator] ${record.target.name} has problem with it's definition.

     One or more of the dependencies are registered as a InjectableScope.Instance and are used with syncInject.

     Please use inject instead of syncInject to load those dependencies.`)
      throw new Error(
        `[ServiceInstantiator] Service ${record.target.name} cannot be instantiated.`,
      )
    }

    if (typeof builder.create !== 'function') {
      throw new Error(
        `[ServiceInstantiator] Factory ${record.target.name} does not implement the create method.`,
      )
    }

    return builder.create(ctx, args)
  }
}
