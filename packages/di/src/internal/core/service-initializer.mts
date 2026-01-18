import { InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'

import type { FactoryRecord } from '../../token/registry.mjs'
import type { Injectors } from '../../utils/index.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'

/**
 * Creates service instances from registry records.
 *
 * Handles both class-based (@Injectable) and factory-based (@Factory) services,
 * managing the instantiation lifecycle including lifecycle hook invocation.
 */
export class ServiceInitializer {
  constructor(private readonly injectors: Injectors) {}

  /**
   * Instantiates a service based on its registry record.
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service
   * @returns Promise resolving to [undefined, instance] or [error]
   */
  async instantiateService<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any = undefined,
  ): Promise<[undefined, T] | [DIError]> {
    try {
      switch (record.type) {
        case InjectableType.Class:
          return this.instantiateClass(ctx, record, args)
        case InjectableType.Factory:
          return this.instantiateFactory(ctx, record, args)
        default:
          throw DIError.unknown(`[ServiceInitializer] Unknown service type: ${record.type}`)
      }
    } catch (error) {
      return [
        error instanceof DIError
          ? error
          : DIError.initializationError(record.target.name, error as Error),
      ]
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
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
    try {
      const tryLoad = this.injectors.wrapSyncInit(() => {
        const original = this.injectors.provideFactoryContext(ctx as ServiceInitializationContext)
        let result = new record.target(...(args ? [args] : []))
        this.injectors.provideFactoryContext(original)
        return result
      })

      let [instance, promises, injectState] = tryLoad()
      if (promises.length > 0) {
        const results = await Promise.allSettled(promises)
        if (results.some((result) => result.status === 'rejected')) {
          throw DIError.initializationError(
            record.target.name,
            new Error('Service cannot be instantiated'),
          )
        }
        const newRes = tryLoad(injectState)
        instance = newRes[0]
        promises = newRes[1]
      }

      if (promises.length > 0) {
        console.error(
          `[ServiceInitializer] ${record.target.name} has problem with it's definition.

       One or more of the dependencies are registered as a InjectableScope.Transient and are used with inject.

       Please use asyncInject instead of inject to load those dependencies.`,
        )
        throw DIError.initializationError(
          record.target.name,
          new Error('Service cannot be instantiated'),
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
      return [
        error instanceof DIError
          ? error
          : DIError.initializationError(record.target.name, error as Error),
      ]
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
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
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
          throw DIError.initializationError(
            record.target.name,
            new Error('Service cannot be instantiated'),
          )
        }
        const newRes = tryLoad(injectState)
        builder = newRes[0]
        promises = newRes[1]
      }

      if (promises.length > 0) {
        console.error(
          `[ServiceInitializer] ${record.target.name} has problem with it's definition.

       One or more of the dependencies are registered as a InjectableScope.Transient and are used with inject.

       Please use asyncInject instead of inject to load those dependencies.`,
        )
        throw DIError.initializationError(
          record.target.name,
          new Error('Service cannot be instantiated'),
        )
      }

      if (typeof builder.create !== 'function') {
        throw DIError.initializationError(
          record.target.name,
          new Error('Factory does not implement the create method'),
        )
      }

      const instance = await builder.create(ctx, args)
      return [undefined, instance]
    } catch (error) {
      return [
        error instanceof DIError
          ? error
          : DIError.initializationError(record.target.name, error as Error),
      ]
    }
  }
}
