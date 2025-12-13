import type { z, ZodObject } from 'zod/v4'

import type { AbstractRequestConfig } from './common.mjs'
import type { AnyEndpointConfig, AnyStreamConfig, BaseStreamConfig } from './config.mjs'

export type ParsePathParams<
  T extends string,
  TAcc = never,
> = T extends `${string}$${infer TPossiblyParam}`
  ? TPossiblyParam extends `${infer TParam}/${infer TRest}`
    ? ParsePathParams<TRest, TParam extends '' ? '_splat' : TParam | TAcc>
    : TPossiblyParam extends ''
      ? '_splat'
      : TPossiblyParam | TAcc
  : TAcc

export type UrlParams<Url extends string> = {
  [key in ParsePathParams<Url>]: string | number
}

export type UrlHasParams<Url extends string> =
  ParsePathParams<Url> extends never ? false : true

export interface NaviosZodRequestBase
  extends Pick<AbstractRequestConfig, 'signal' | 'headers'> {
  [key: string]: any
}

export type NaviosZodRequest<Config extends BaseStreamConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['requestSchema'] extends ZodObject
    ? { data: z.input<Config['requestSchema']> }
    : {}) &
  (Config['querySchema'] extends ZodObject
    ? { params: z.input<Config['querySchema']> }
    : {}) &
  NaviosZodRequestBase

export type EndpointFunctionArgs<
  Url extends string,
  QuerySchema = undefined,
  RequestSchema = undefined,
  IsServer extends boolean = false,
> = (QuerySchema extends ZodObject
  ? {
      params: z.infer<QuerySchema>
    }
  : {}) &
  (RequestSchema extends ZodObject
    ? {
        data: z.infer<RequestSchema>
      }
    : {}) &
  (UrlHasParams<Url> extends true
    ? {
        urlParams: UrlParams<Url>
      }
    : {}) &
  (IsServer extends false ? NaviosZodRequestBase : {})

export type Util_FlatObject<T> = T extends object
  ? { [K in keyof T]: K extends 'urlParams' ? Util_FlatObject<T[K]> : T[K] }
  : T

export type AbstractStream<Config extends AnyStreamConfig> = ((
  params: any,
) => Promise<Blob>) & {
  config: Config
}

export type AbstractEndpoint<Config extends AnyEndpointConfig> = ((
  params: any,
) => Promise<z.infer<Config['responseSchema']>>) & {
  config: Config
}
