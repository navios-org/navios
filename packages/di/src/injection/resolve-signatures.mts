import type { Factorable, FactorableWithArgs } from '../provider/factorable.mjs'
import type { InferInput } from '../schema/standard-schema.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithoutArguments,
} from '../token/class-type.mjs'
import type {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'

import type { MissingArgsError } from './missing-args-error.mjs'

/**
 * Overloads shared by `container.get`, `asyncInject` and `ctx.resolve`.
 */
export interface AsyncResolve {
  // #1 Simple class
  <T extends ClassTypeWithoutArguments>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  // #1.1 Class with args
  <Args, T extends ClassTypeWithArgument<Args>>(token: T, args: Args): Promise<InstanceType<T>>
  <Schema extends InjectionTokenSchemaType, R, T extends FactorableWithArgs<R, Schema>>(
    token: T,
    args: InferInput<Schema>,
  ): Promise<R>
  // #2 Token with a schema
  <T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: InferInput<S>,
  ): Promise<T>
  // #3 Token with an optional schema
  <T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? Promise<T> : MissingArgsError<S>
  // #4 Token with no schema
  <T>(token: InjectionToken<T, undefined>): Promise<T>
  <T>(token: BoundInjectionToken<T, any>): Promise<T>
  <T>(token: FactoryInjectionToken<T, any>): Promise<T>
}

/**
 * Overloads shared by `inject` and `container.getSync`.
 */
export interface SyncResolve {
  <T extends ClassTypeWithoutArguments>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
  <Args, T extends ClassTypeWithArgument<Args>>(token: T, args: Args): InstanceType<T>
  <Schema extends InjectionTokenSchemaType, R, T extends FactorableWithArgs<R, Schema>>(
    token: T,
    args: InferInput<Schema>,
  ): R
  <T, S extends InjectionTokenSchemaType>(token: InjectionToken<T, S>, args: InferInput<S>): T
  <T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? T : MissingArgsError<S>
  <T>(token: InjectionToken<T, undefined>): T
  <T>(token: BoundInjectionToken<T, any>): T
  <T>(token: FactoryInjectionToken<T, any>): T
}

/**
 * Overloads of `optional`.
 */
export interface OptionalResolve {
  <T extends ClassType>(
    token: T,
  ): (InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>) | null
  <T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: InferInput<S>,
  ): T | null
  <T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? T | null : MissingArgsError<S>
  <T>(token: InjectionToken<T, undefined>): T | null
  <T>(token: BoundInjectionToken<T, any>): T | null
  <T>(token: FactoryInjectionToken<T, any>): T | null
}
