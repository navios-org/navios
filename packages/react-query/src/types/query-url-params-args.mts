import type { UrlHasParams, UrlParams } from '@navios/common'

export type ClientQueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true
    ? { urlParams: UrlParams<Url> }
    : {} | undefined
