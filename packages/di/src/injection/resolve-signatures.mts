import type { ScopedContainer } from '../container/scoped-container.mjs'
import type { ResolvedInstance } from '../provider/factorable.mjs'
import type { InferInput, StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type { ClassTypeWithArgument, ClassTypeWithoutArguments } from '../token/class-type.mjs'
import type {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { MissingArgsError } from './missing-args-error.mjs'

/**
 * Overloads shared by `container.get`, `asyncInject` and `ctx.inject`.
 */
export interface AsyncResolve {
  // #1 Simple class
  <T extends ClassTypeWithoutArguments>(token: T): Promise<ResolvedInstance<T>>
  // #1.1 The current scope
  (token: typeof ScopedContainer): Promise<ScopedContainer>
  // #1.2 Class with args
  <Args, T extends ClassTypeWithArgument<Args>>(token: T, args: Args): Promise<InstanceType<T>>
  // #2 Token with a schema
  <T, S extends StandardSchemaV1>(token: InjectionToken<T, S>, args: InferInput<S>): Promise<T>
  // #3 Token with an optional schema
  <T, S extends StandardSchemaV1, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? Promise<T> : MissingArgsError<S>
  // #4 Token with no schema
  <T>(token: InjectionToken<T, unknown>): Promise<T>
  <T>(token: BoundInjectionToken<T, any>): Promise<T>
  <T>(token: FactoryInjectionToken<T, any>): Promise<T>
}

/**
 * Overloads shared by `inject` and `container.getSync`.
 */
export interface SyncResolve {
  <T extends ClassTypeWithoutArguments>(token: T): ResolvedInstance<T>
  (token: typeof ScopedContainer): ScopedContainer
  <Args, T extends ClassTypeWithArgument<Args>>(token: T, args: Args): InstanceType<T>
  <T, S extends StandardSchemaV1>(token: InjectionToken<T, S>, args: InferInput<S>): T
  <T, S extends StandardSchemaV1, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? T : MissingArgsError<S>
  <T>(token: InjectionToken<T, unknown>): T
  <T>(token: BoundInjectionToken<T, any>): T
  <T>(token: FactoryInjectionToken<T, any>): T
}

/**
 * Overloads of `optional` and `container.peek`.
 */
export interface OptionalResolve {
  <T extends ClassTypeWithoutArguments>(token: T): ResolvedInstance<T> | null
  (token: typeof ScopedContainer): ScopedContainer | null
  <Args, T extends ClassTypeWithArgument<Args>>(token: T, args: Args): InstanceType<T> | null
  <T, S extends StandardSchemaV1>(token: InjectionToken<T, S>, args: InferInput<S>): T | null
  <T, S extends StandardSchemaV1, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? T | null : MissingArgsError<S>
  <T>(token: InjectionToken<T, unknown>): T | null
  <T>(token: BoundInjectionToken<T, any>): T | null
  <T>(token: FactoryInjectionToken<T, any>): T | null
}
