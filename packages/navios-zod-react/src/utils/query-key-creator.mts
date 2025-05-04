import type {
  EndpointConfig,
  UrlHasParams,
  UrlParams,
} from '@navios/navios-zod'
import type { DataTag, InfiniteData } from '@tanstack/react-query'
import type { AnyZodObject, z } from 'zod'

import { bindUrlParams } from '@navios/navios-zod'

import type { BaseQueryParams } from '../types.mjs'

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export function queryKeyCreator<
  Config extends EndpointConfig,
  Options extends BaseQueryParams<Config>,
  IsInfinite extends boolean,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options,
  isInfinite: IsInfinite,
): {
  template: Split<Url, '/'>
  dataTag: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (Config['querySchema'] extends AnyZodObject
        ? { params: z.input<Config['querySchema']> }
        : {}),
  ) => Options['processResponse'] extends (...args: any[]) => infer Result
    ? DataTag<
        [Config['url']],
        IsInfinite extends true ? InfiniteData<Result> : Result,
        Error
      >
    : never
  filterKey: (
    params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
  ) => Options['processResponse'] extends (...args: any[]) => infer Result
    ? DataTag<
        [Config['url']],
        IsInfinite extends true ? InfiniteData<Result> : Result,
        Error
      >
    : never
  bindToUrl: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (Config['querySchema'] extends AnyZodObject
        ? { params: z.infer<Config['querySchema']> }
        : {}),
  ) => string
} {
  const url = config.url as Url
  const urlParts = url.split('/').filter(Boolean) as Split<Url, '/'>
  return {
    template: urlParts,
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
      ] as unknown as Options['processResponse'] extends (
        ...args: any[]
      ) => infer Result
        ? DataTag<
            [Config['url']],
            IsInfinite extends true ? InfiniteData<Result> : Result,
            Error
          >
        : never
    },
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
      ] as unknown as Options['processResponse'] extends (
        ...args: any[]
      ) => infer Result
        ? DataTag<
            [Config['url']],
            IsInfinite extends true ? InfiniteData<Result> : Result,
            Error
          >
        : never
    },

    bindToUrl: (params) => {
      return bindUrlParams<Url>(url, params ?? ({} as any))
    },
  }
}
