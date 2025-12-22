import type { z } from 'zod/v4'

import type { FactoryContext } from '../internal/context/factory-context.mjs'
import type { InjectionTokenSchemaType } from '../token/injection-token.mjs'

export interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactorableWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [z.output<A>]): Promise<T> | T
}
