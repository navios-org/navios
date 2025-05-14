import { z } from 'zod'

import type { InjectionTokenSchemaType } from '../injection-token.mjs'

export interface Factory<T> {
  create(ctx?: any): Promise<T> | T
}

export interface FactoryWithArgs<T, A extends InjectionTokenSchemaType> {
  create(ctx: any, args: z.output<A>): Promise<T> | T
}
