import type { AnyZodObject } from 'zod'

import { z } from 'zod'

export interface Factory<T> {
  create(ctx?: any): Promise<T> | T
}

export interface FactoryWithArgs<T, A extends AnyZodObject> {
  create(ctx: any, args: z.output<A>): Promise<T> | T
}
