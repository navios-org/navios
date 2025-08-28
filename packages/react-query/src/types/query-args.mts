import type { UrlHasParams, UrlParams } from '@navios/builder'
import type { z, ZodObject } from 'zod/v4'

export type ClientQueryArgs<
  Url extends string = string,
  QuerySchema = ZodObject,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {})
