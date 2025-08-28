import type {
  AnyEndpointConfig,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { DataTag, InfiniteData } from '@tanstack/react-query'
import type { z, ZodObject } from 'zod/v4'

import { bindUrlParams } from '@navios/builder'

import type { BaseQueryParams } from '../types.mjs'

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export type QueryKeyCreatorResult<
  QuerySchema = undefined,
  Url extends string = string,
  Result = unknown,
  IsInfinite extends boolean = false,
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
> = {
  template: Split<Url, '/'>
  dataTag: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {}),
  ) => DataTag<
    Split<Url, '/'>,
    IsInfinite extends true ? InfiniteData<Result> : Result,
    Error
  >
  filterKey: (
    params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
  ) => DataTag<
    Split<Url, '/'>,
    IsInfinite extends true ? InfiniteData<Result> : Result,
    Error
  >
  bindToUrl: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (QuerySchema extends ZodObject ? { params: z.infer<QuerySchema> } : {}),
  ) => string
}

export function queryKeyCreator<
  Config extends AnyEndpointConfig,
  Options extends BaseQueryParams<Config>,
  IsInfinite extends boolean,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options,
  isInfinite: IsInfinite,
): QueryKeyCreatorResult<
  Config['querySchema'],
  Url,
  Options['processResponse'] extends (...args: any[]) => infer Result
    ? Result
    : never,
  IsInfinite,
  HasParams
> {
  const url = config.url as Url
  const urlParts = url.split('/').filter(Boolean) as Split<Url, '/'>
  return {
    template: urlParts,
    // @ts-expect-error We have correct types in return type
    dataTag: (params) => {
      const queryParams =
        params && 'querySchema' in config && 'params' in params
          ? config.querySchema?.parse(params.params)
          : []
      return [
        ...(options.keyPrefix ?? []),
        ...urlParts.map((part) =>
          part.startsWith('$')
            ? // @ts-expect-error TS2339 We know that the urlParams are defined only if the url has params
              params.urlParams[part.slice(1)].toString()
            : part,
        ),
        ...(options.keySuffix ?? []),
        queryParams ?? [],
      ] as unknown as DataTag<
        Split<Url, '/'>,
        Options['processResponse'] extends (...args: any[]) => infer Result
          ? IsInfinite extends true
            ? InfiniteData<Result>
            : Result
          : never,
        Error
      >
    },
    // @ts-expect-error We have correct types in return type
    filterKey: (params) => {
      return [
        ...(options.keyPrefix ?? []),
        ...urlParts.map((part) =>
          part.startsWith('$')
            ? // @ts-expect-error TS2339 We know that the urlParams are defined only if the url has params
              params.urlParams[part.slice(1)].toString()
            : part,
        ),
        ...(options.keySuffix ?? []),
      ] as unknown as DataTag<
        Split<Url, '/'>,
        Options['processResponse'] extends (...args: any[]) => infer Result
          ? IsInfinite extends true
            ? InfiniteData<Result>
            : Result
          : never,
        Error
      >
    },

    bindToUrl: (params) => {
      return bindUrlParams<Url>(url, params ?? ({} as any))
    },
  }
}
