import type { FactoryContext } from './factory-context.mjs'
import type { FactoryRecord } from './registry.mjs'
import type { Injectors } from './utils/get-injectors.mjs'

import { InjectableType } from './enums/index.mjs'

/**
 * ServiceInstantiator handles the instantiation of services based on registry records.
 * It replaces the hard-coded logic in Injectable and Factory decorators.
 */
export class ServiceInstantiator {
  constructor(private readonly injectors: Injectors) {}

  /**
   * Instantiates a service based on its registry record.
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service
   * @returns Promise resolving to [undefined, instance] or [error]
   */
  async instantiateService<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any = undefined,
  ): Promise<[undefined, T] | [Error]> {
    try {
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
    } catch (error) {
      return [error instanceof Error ? error : new Error(String(error))]
    }
  }

  /**
   * Instantiates a class-based service (Injectable decorator).
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service constructor
   * @returns Promise resolving to [undefined, instance] or [error]
   */
  private async instantiateClass<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [Error]> {
    try {
      const tryLoad = this.injectors.wrapSyncInit(() => {
        const original = this.injectors.provideFactoryContext(ctx)
        let result = new record.target(...(args ? [args] : []))
        this.injectors.provideFactoryContext(original)
        return result
      })

      let [instance, promises, injectState] = tryLoad()
      if (promises.length > 0) {
        const results = await Promise.allSettled(promises)
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error(
            `[ServiceInstantiator] Service ${record.target.name} cannot be instantiated.`,
          )
        }
        const newRes = tryLoad(injectState)
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

      return [undefined, instance]
    } catch (error) {
      return [error instanceof Error ? error : new Error(String(error))]
    }
  }

  /**
   * Instantiates a factory-based service (Factory decorator).
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the factory
   * @returns Promise resolving to [undefined, instance] or [error]
   */
  private async instantiateFactory<T>(
    ctx: FactoryContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [Error]> {
    try {
      const tryLoad = this.injectors.wrapSyncInit(() => {
        const original = this.injectors.provideFactoryContext(ctx)
        let result = new record.target()
        this.injectors.provideFactoryContext(original)
        return result
      })

      let [builder, promises, injectState] = tryLoad()
      if (promises.length > 0) {
        const results = await Promise.allSettled(promises)
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error(
            `[ServiceInstantiator] Service ${record.target.name} cannot be instantiated.`,
          )
        }
        const newRes = tryLoad(injectState)
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

      const instance = await builder.create(ctx, args)
      return [undefined, instance]
    } catch (error) {
      return [error instanceof Error ? error : new Error(String(error))]
    }
  }
}
