import type { UrlHasParams, UrlParams } from '@navios/common'
import type { AnyZodObject, z } from 'zod'

export type ClientMutationArgs<
  Url extends string = string,
  RequestSchema = unknown,
  QuerySchema = unknown,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (RequestSchema extends AnyZodObject ? { data: z.input<RequestSchema> } : {}) &
  (QuerySchema extends AnyZodObject ? { params: z.input<QuerySchema> } : {})
