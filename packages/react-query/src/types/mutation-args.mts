import type { UrlHasParams, UrlParams } from '@navios/builder'
import type { z, ZodObject } from 'zod/v4'

export type ClientMutationArgs<
  Url extends string = string,
  RequestSchema = unknown,
  QuerySchema = unknown,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (RequestSchema extends ZodObject ? { data: z.input<RequestSchema> } : {}) &
  (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {})
