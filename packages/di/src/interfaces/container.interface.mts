import type { StandardSchemaV1 } from '../token/schema.mjs'
import type {
  BoundToken,
  ClassType,
  ClassTypeWithArgument,
  FactoryToken,
  Token,
  TokenSchemaType,
} from '../token/token.mjs'
import type { TokenArgsRequiredError } from '../utils/types.mjs'

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
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  get<T extends ClassTypeWithArgument<R>, R>(token: T, args: R): Promise<InstanceType<T>>
  // #2 Token with required Schema
  get<T, S extends TokenSchemaType>(
    token: Token<T, S>,
    args: StandardSchemaV1.InferInput<S>,
  ): Promise<T>
  // #3 Token with schema resolved without args -> compile-time DX error
  get<T, S extends TokenSchemaType, R extends boolean>(
    token: Token<T, S, R>,
  ): R extends false ? Promise<T> : TokenArgsRequiredError<S>
  // #4 Token with no Schema
  get<T>(token: Token<T, undefined>): Promise<T>
  get<T>(token: BoundToken<T, any>): Promise<T>
  get<T>(token: FactoryToken<T, any>): Promise<T>

  /**
   * Invalidates a service and its dependencies.
   */
  invalidate(service: unknown): Promise<void>

  /**
   * Checks if a service is registered in the container.
   */
  isRegistered(token: any): boolean

  /**
   * Adds an instance to the container.
   * Accepts class types, Tokens, and BoundTokens.
   * Rejects Tokens with required schemas (use BoundToken instead).
   *
   * @param token The class type, Token, or BoundToken to register the instance for
   * @param instance The instance to store
   */
  addInstance<T>(
    token: ClassType | Token<T, any> | BoundToken<T, any>,
    instance: T,
  ): void

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
