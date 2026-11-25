import type { InferOutput } from '../schema/standard-schema.mjs'
import type { InjectionTokenSchemaType } from '../token/injection-token.mjs'

import type { FactoryContext } from './factory-context.mjs'

export interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactorableWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [InferOutput<A>]): Promise<T> | T
}
