import type { UrlHasParams, UrlParams } from '@navios/builder'
import type { DataTag } from '@tanstack/react-query'

export type MutationHelpers<Url extends string, Result = unknown> =
  UrlHasParams<Url> extends true
    ? {
        mutationKey: (params: UrlParams<Url>) => DataTag<[Url], Result, Error>
        useIsMutating: (keyParams: UrlParams<Url>) => boolean
      }
    : {
        mutationKey: () => DataTag<[Url], Result, Error>
        useIsMutating: () => boolean
      }
