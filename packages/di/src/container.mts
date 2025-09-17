import type { z, ZodType } from 'zod/v4'

import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Factorable } from './interfaces/factory.interface.mjs'
import type { Registry } from './registry.mjs'
import type { Join, UnionToArray } from './utils/types.mjs'

import { Injectable } from './decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from './enums/index.mjs'
import { globalRegistry } from './registry.mjs'
import { ServiceLocator } from './service-locator.mjs'
import { getInjectableToken } from './utils/get-injectable-token.mjs'

/**
 * Container class that provides a simplified public API for dependency injection.
 * It wraps a ServiceLocator instance and provides convenient methods for getting instances.
 */
@Injectable()
export class Container {
  private readonly serviceLocator: ServiceLocator

  constructor(
    registry: Registry = globalRegistry,
    logger: Console | null = null,
  ) {
    this.serviceLocator = new ServiceLocator(registry, logger)
    this.registerSelf()
  }

  private registerSelf() {
    const token = getInjectableToken(Container)
    const instanceName = this.serviceLocator.getInstanceIdentifier(token)
    this.serviceLocator['manager'].storeCreatedHolder(
      instanceName,
      this,
      InjectableType.Class,
      InjectableScope.Singleton,
    )
  }

  /**
   * Gets an instance from the container.
   * This method has the same type signature as the inject method from get-injectors.mts
   */
  // #1 Simple class
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  // #2 Token with required Schema
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  // #3 Token with optional Schema
  get<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? Promise<T>
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  // #4 Token with no Schema
  get<T>(token: InjectionToken<T, undefined>): Promise<T>
  get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  get<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  async get(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ) {
    return this.serviceLocator.getOrThrowInstance(token, args as any)
  }

  /**
   * Gets the underlying ServiceLocator instance for advanced usage
   */
  getServiceLocator(): ServiceLocator {
    return this.serviceLocator
  }

  /**
   * Invalidates a service and its dependencies
   */
  async invalidate(service: unknown): Promise<void> {
    const holderMap = this.serviceLocator['manager'].filter(
      (holder) => holder.instance === service,
    )
    if (holderMap.size === 0) {
      return
    }
    const holder = holderMap.values().next().value
    if (holder) {
      await this.serviceLocator.invalidate(holder.name)
    }
  }

  /**
   * Waits for all pending operations to complete
   */
  async ready(): Promise<void> {
    await this.serviceLocator.ready()
  }
}
