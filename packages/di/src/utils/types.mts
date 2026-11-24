import type { Factorable, FactorableWithArgs } from '../interfaces/factory.interface.mjs'
import type { InferInput, StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithoutArguments,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'

export type Join<TElements, TSeparator extends string> =
  TElements extends Readonly<[infer First, ...infer Rest]>
    ? Rest extends ReadonlyArray<string>
      ? First extends string
        ? `${First}${Rest extends [] ? '' : TSeparator}${Join<Rest, TSeparator>}`
        : never
      : never
    : ''

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

export type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>

export type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never

export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

export type UnionToArray<T, A extends unknown[] = []> =
  IsUnion<T> extends true ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]> : [T, ...A]

/**
 * The type shown when a token that requires args is resolved without them.
 */
export type MissingArgsError<S> = S extends StandardSchemaV1
  ? `Error: Your token requires args: ${Join<UnionToArray<keyof NonNullable<InferInput<S>>>, ', '>}`
  : 'Error: Your token requires args'

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
