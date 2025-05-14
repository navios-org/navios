import { z } from 'zod'

import type { FactoryContext } from '../factory-context.mjs'
import type { InjectionTokenSchemaType } from '../injection-token.mjs'

export interface Factory<T> {
  create(ctx?: FactoryContext): Promise<T> | T
}

export interface FactoryWithArgs<T, A extends InjectionTokenSchemaType> {
  create(...args: [FactoryContext, z.output<A>]): Promise<T> | T
}
