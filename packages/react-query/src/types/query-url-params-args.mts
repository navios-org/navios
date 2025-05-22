import type { UrlHasParams, UrlParams } from '@navios/builder'

export type ClientQueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true
    ? { urlParams: UrlParams<Url> }
    : {} | undefined
