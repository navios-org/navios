import { z } from 'zod/v4'

import type { FactoryContext } from '../factory-context.mjs'
import type { InjectionTokenSchemaType } from '../injection-token.mjs'

export interface Factorable<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactorableWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx?: FactoryContext, ...args: [z.output<A>]): Promise<T> | T
}
