import { queryOptions, skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'
import type { QueryClient } from '@tanstack/react-query'

import { createCaller } from '../common/call.mjs'
import { callOptionsFor } from '../common/http-client.mjs'

import type { MaybeWithResponse } from '../common/call.mjs'
import type { EndpointData, EndpointFailure, SurfaceOptions } from '../common/types.mjs'

import { createKeyBuilder } from './key.mjs'

import type { QueryObject } from './types.mjs'

function noop() {}

type LooseArgs = Record<string, unknown> | undefined
type LooseOptions = Record<string, unknown> | undefined

/**
 * Creates a {@link QueryObject} for an endpoint.
 *
 * `client.query(...)` is the usual entry point; this is the function behind
 * it, exported for use without a client instance.
 *
 * The query function always calls the throwing form of the endpoint, so a
 * failure reaches React Query's error channel as the endpoint's
 * `EndpointError` — retries, `isError` and error boundaries work as usual.
 *
 * @example
 * ```ts
 * const getUser = makeQuery(getUserEndpoint)
 *
 * const { data, error } = getUser.use({ urlParams: { userId } })
 * await getUser.prefetch(queryClient, { urlParams: { userId } })
 * ```
 */
export function makeQuery<
  const Options extends BaseEndpointOptions,
  const WithResponse extends boolean = false,
>(
  endpoint: EndpointHandler<Options>,
  options: SurfaceOptions<WithResponse> = {},
): QueryObject<
  Options,
  MaybeWithResponse<EndpointData<Options>, WithResponse>,
  EndpointFailure<Options>
> {
  const keys = createKeyBuilder(endpoint.config, options, false)
  const call = createCaller(endpoint as never, options.withResponse)

  const build = (args?: LooseArgs, overrides?: LooseOptions) =>
    queryOptions({
      queryKey: keys.key(args),
      queryFn: ({ signal, client }) => call({ signal, ...args }, callOptionsFor(client)),
      ...overrides,
    })

  const query = build as unknown as Record<string, unknown>

  query.key = (args?: LooseArgs) => keys.key(args)

  query.use = (args?: LooseArgs | typeof skipToken, overrides?: LooseOptions) =>
    useQuery(
      (args === skipToken
        ? { ...overrides, queryKey: keys.skipped(), queryFn: skipToken }
        : build(args, overrides)) as never,
    )

  query.useSuspense = (args?: LooseArgs, overrides?: LooseOptions) =>
    useSuspenseQuery(build(args, overrides) as never)

  query.fetch = (queryClient: QueryClient, args?: LooseArgs) => queryClient.query(build(args))

  query.prefetch = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.query(build(args)).then(noop, noop)

  query.ensure = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.query({ ...build(args), staleTime: 'static' })

  query.getData = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.getQueryData(keys.key(args))

  query.setData = (queryClient: QueryClient, args: LooseArgs, updater: unknown) =>
    queryClient.setQueryData(keys.key(args), updater as never)

  query.invalidate = (queryClient: QueryClient, args?: LooseArgs, filters?: LooseOptions) =>
    queryClient.invalidateQueries({ ...filters, queryKey: keys.key(args) })

  query.endpoint = endpoint

  return query as never
}
