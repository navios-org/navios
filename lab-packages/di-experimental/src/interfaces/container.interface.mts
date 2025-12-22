import type { z, ZodType } from 'zod/v4'

import type {
  BoundInjectionToken,
  ClassType,
  ClassTypeWithArgument,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Join, UnionToArray } from '../utils/types.mjs'
import type { Factorable } from './factory.interface.mjs'

/**
 * Interface for dependency injection containers.
 * Both Container and ScopedContainer implement this interface,
 * allowing them to be used interchangeably in factory contexts.
 */
export interface IContainer {
  /**
   * Gets an instance from the container.
   */
  // #1 Simple class
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  get<T extends ClassTypeWithArgument<R>, R>(
    token: T,
    args: R,
  ): Promise<InstanceType<T>>
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

  /**
   * Invalidates a service and its dependencies.
   */
  invalidate(service: unknown): Promise<void>

  /**
   * Checks if a service is registered in the container.
   */
  isRegistered(token: any): boolean

  /**
   * Disposes the container and cleans up all resources.
   */
  dispose(): Promise<void>

  /**
   * Waits for all pending operations to complete.
   */
  ready(): Promise<void>

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   * Returns null if the instance doesn't exist or is not ready.
   * Used internally by the inject system for synchronous property initialization.
   */
  tryGetSync<T>(token: any, args?: any): T | null
}

