import type { FactoryContext } from '../internal/context/factory-context.mjs'
import type { StandardSchemaV1 } from '../token/schema.mjs'
import type { TokenSchemaType } from '../token/token.mjs'

export interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactorableWithArgs<T, A extends TokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [StandardSchemaV1.InferOutput<A>]): Promise<T> | T
}
