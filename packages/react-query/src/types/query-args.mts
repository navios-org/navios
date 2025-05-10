import type { UrlHasParams, UrlParams } from '@navios/common'
import type { AnyZodObject, z } from 'zod'

export type ClientQueryArgs<
  Url extends string = string,
  QuerySchema = AnyZodObject,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (QuerySchema extends AnyZodObject ? { params: z.input<QuerySchema> } : {})
