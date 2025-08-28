import type { Util_FlatObject } from '@navios/builder'
import type {
  QueryClient,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'
import type { ZodObject } from 'zod/v4'

import type { QueryKeyCreatorResult } from '../utils/query-key-creator.mjs'
import type { ClientQueryArgs } from './query-args.mjs'
import type { ClientQueryUrlParamsArgs } from './query-url-params-args.mjs'

export type QueryHelpers<
  Url extends string,
  QuerySchema extends ZodObject | undefined = undefined,
  Result = undefined,
  IsInfinite extends boolean = false,
> = {
  queryKey: QueryKeyCreatorResult<QuerySchema, Url, Result, IsInfinite>
  use: (
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseQueryResult<Result, Error>
  useSuspense: (
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseQueryResult<Result, Error>
  invalidate: (
    queryClient: QueryClient,
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => () => Promise<void>
  invalidateAll: (
    queryClient: QueryClient,
    params: Util_FlatObject<ClientQueryUrlParamsArgs<Url>>,
  ) => () => Promise<void>
}
