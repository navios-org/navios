import {
  infiniteQueryOptions,
  skipToken,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'

import type { EndpointHandler } from '@navios/builder'
import type { QueryClient } from '@tanstack/react-query'

import { createCaller } from '../common/call.mjs'
import { callOptionsFor } from '../common/http-client.mjs'

import type { MaybeWithResponse } from '../common/call.mjs'
import type { EndpointData } from '../common/types.mjs'

import { createKeyBuilder } from './key.mjs'

import type {
  InfiniteEndpointOptions,
  InfiniteQueryObject,
  InfiniteQuerySettings,
} from './types.mjs'

function noop() {}

type LooseArgs = { params?: Record<string, unknown>; [key: string]: unknown } | undefined
type LooseOptions = Record<string, unknown> | undefined

/**
 * Creates an {@link InfiniteQueryObject} for an endpoint.
 *
 * Each page calls the endpoint with the page param merged over the call's
 * `params`. The first page param defaults to those `params` themselves.
 *
 * Infinite queries get their own cache entries: the key carries an
 * `'infinite'` marker, so the same endpoint can also be used as a plain
 * query without the two overwriting each other.
 *
 * @example
 * ```ts
 * const listUsers = makeInfiniteQuery(listUsersEndpoint, {
 *   getNextPageParam: (lastPage, _all, lastParam) =>
 *     lastPage.hasMore ? { ...lastParam, page: lastParam.page + 1 } : undefined,
 * })
 *
 * const { data, fetchNextPage } = listUsers.use({ params: { page: 1 } })
 * ```
 */
export function makeInfiniteQuery<
  const Options extends InfiniteEndpointOptions,
  const WithResponse extends boolean = false,
>(
  endpoint: EndpointHandler<Options>,
  settings: InfiniteQuerySettings<
    Options,
    MaybeWithResponse<EndpointData<Options>, WithResponse>,
    WithResponse
  >,
): InfiniteQueryObject<Options, MaybeWithResponse<EndpointData<Options>, WithResponse>> {
  const { getNextPageParam, getPreviousPageParam, initialPageParam, ...keyOptions } = settings
  const { withResponse } = keyOptions
  const keys = createKeyBuilder(endpoint.config, keyOptions, true)
  const call = createCaller(endpoint as never, withResponse)

  const firstPageParam = (args: LooseArgs) => {
    if (initialPageParam !== undefined) return initialPageParam
    return args?.params ?? {}
  }

  const pagination = (args: LooseArgs) => ({
    getNextPageParam: getNextPageParam as never,
    ...(getPreviousPageParam ? { getPreviousPageParam: getPreviousPageParam as never } : {}),
    initialPageParam: firstPageParam(args),
  })

  const build = (args?: LooseArgs, overrides?: LooseOptions) =>
    infiniteQueryOptions({
      queryKey: keys.key(args),
      queryFn: ({ signal, pageParam, client }) =>
        call(
          {
            signal,
            ...args,
            params: { ...args?.params, ...(pageParam as Record<string, unknown>) },
          },
          callOptionsFor(client),
        ),
      ...overrides,
      ...pagination(args),
    })

  const query = build as unknown as Record<string, unknown>

  query.key = (args?: LooseArgs) => keys.key(args)

  query.use = (args?: LooseArgs | typeof skipToken, overrides?: LooseOptions) =>
    useInfiniteQuery(
      (args === skipToken
        ? {
            ...overrides,
            ...pagination(undefined),
            queryKey: keys.skipped(),
            queryFn: skipToken,
          }
        : build(args, overrides)) as never,
    )

  query.useSuspense = (args?: LooseArgs, overrides?: LooseOptions) =>
    useSuspenseInfiniteQuery(build(args, overrides) as never)

  query.fetch = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.infiniteQuery(build(args) as never)

  query.prefetch = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.infiniteQuery(build(args) as never).then(noop, noop)

  query.ensure = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.infiniteQuery({ ...build(args), staleTime: 'static' } as never)

  query.getData = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.getQueryData(keys.key(args))

  query.setData = (queryClient: QueryClient, args: LooseArgs, updater: unknown) =>
    queryClient.setQueryData(keys.key(args), updater as never)

  query.invalidate = (queryClient: QueryClient, args?: LooseArgs, filters?: LooseOptions) =>
    queryClient.invalidateQueries({ ...filters, queryKey: keys.key(args) })

  query.endpoint = endpoint

  return query as never
}
