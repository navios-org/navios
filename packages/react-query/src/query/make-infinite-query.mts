import {
  infiniteQueryOptions,
  skipToken,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'

import type { EndpointHandler } from '@navios/builder'
import type { QueryClient } from '@tanstack/react-query'

import { createKeyBuilder } from '../endpoint/cache-key.mjs'
import { createCaller } from '../endpoint/create-caller.mjs'
import { callOptionsFor } from '../endpoint/http-client.mjs'

import type { SurfaceData } from '../endpoint/create-caller.mjs'

import { attachCacheHelpers, prefetchFrom, skippedOptions } from './cache-helpers.mjs'

import type { LooseOptions } from './cache-helpers.mjs'
import type {
  InfiniteEndpointOptions,
  InfiniteQueryObject,
  InfiniteQuerySettings,
} from './infinite-query-object.mjs'

type LooseArgs = { params?: Record<string, unknown>; [key: string]: unknown } | undefined

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
  settings: InfiniteQuerySettings<Options, SurfaceData<Options, WithResponse>, WithResponse>,
): InfiniteQueryObject<Options, SurfaceData<Options, WithResponse>> {
  const {
    getNextPageParam,
    getPreviousPageParam,
    initialPageParam,
    keyPrefix,
    keySuffix,
    withResponse,
    ...declared
  } = settings
  // The declaration's TanStack options, under whatever a call site passes
  const defaults = declared as LooseOptions
  const keys = createKeyBuilder(endpoint.config, { keyPrefix, keySuffix, withResponse }, true)
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
      ...defaults,
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

  const fetchPages = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.infiniteQuery(build(args) as never)

  const query = build as unknown as Record<string, unknown>

  attachCacheHelpers(query, keys, endpoint)

  query.use = (args?: LooseArgs | typeof skipToken, overrides?: LooseOptions) =>
    useInfiniteQuery(
      (args === skipToken
        ? { ...skippedOptions(keys, defaults, overrides), ...pagination(undefined) }
        : build(args, overrides)) as never,
    )

  query.useSuspense = (args?: LooseArgs, overrides?: LooseOptions) =>
    useSuspenseInfiniteQuery(build(args, overrides) as never)

  query.fetch = fetchPages

  query.prefetch = prefetchFrom(fetchPages)

  query.ensure = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.infiniteQuery({ ...build(args), staleTime: 'static' } as never)

  return query as never
}
