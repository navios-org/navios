import type { InferOutput, StandardSchemaV1 } from '../schema/standard-schema.mjs'
import type { AbstractClassType } from '../token/class-type.mjs'
import type { BoundInjectionToken, InjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from './factory-context.mjs'

export interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactorableWithArgs<T, A extends StandardSchemaV1> {
  create(ctx?: FactoryContext, ...args: [InferOutput<A>]): Promise<T> | T
}

/** `true` for `any` only. */
type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Whether the parameters of a `create()` method are those of a factory: none,
 * or a `FactoryContext` first. A service may well have a `create()` method of
 * its own.
 */
type AreFactoryParameters<P extends readonly unknown[]> = P extends readonly []
  ? true
  : IsAny<P[0]> extends true
    ? false
    : [NonNullable<P[0]>] extends [never]
      ? false
      : [NonNullable<P[0]>] extends [FactoryContext]
        ? true
        : false

/** What the instances of a factory class produce; `Otherwise` for any other class. */
type ProductOf<I, Otherwise> = I extends { create: (...args: infer P) => infer R }
  ? AreFactoryParameters<P> extends true
    ? Awaited<R>
    : Otherwise
  : Otherwise

/**
 * What a class resolves to: its instance, or for a factory class the product
 * of `create()`.
 */
export type ResolvedInstance<C extends AbstractClassType> = ProductOf<
  InstanceType<C>,
  InstanceType<C>
>

/**
 * What may be given for a class with instances of type `I`. The instance itself
 * is listed for generic code, where it is not known yet whether the class is a
 * factory.
 */
export type ProvidedForInstance<I> = I | ProductOf<I, never>

/** What may be given for a class or a token. */
export type ProvidedFor<K> = K extends
  | InjectionToken<infer T, any>
  | BoundInjectionToken<infer T, any>
  ? T
  : K extends AbstractClassType
    ? ProvidedForInstance<InstanceType<K>>
    : never
