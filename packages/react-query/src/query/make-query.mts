import {
  queryOptions,
  skipToken,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'

import type { BaseEndpointOptions, EndpointHandler, InferEndpointError } from '@navios/builder'
import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query'

import { createKeyBuilder } from '../endpoint/cache-key.mjs'
import { createCaller } from '../endpoint/create-caller.mjs'
import { callOptionsFor } from '../endpoint/http-client.mjs'
import { sharedInputsOf, withSharedInputs } from '../endpoint/key-by.mjs'

import type { SurfaceData } from '../endpoint/create-caller.mjs'
import type { AnyKeyBy, KeyBy, SharedInputs } from '../endpoint/key-by.mjs'

import { attachCacheHelpers, prefetchFrom, skippedOptions } from './cache-helpers.mjs'
import {
  entryOf,
  holdsSentInputs,
  requestShared,
  sendSharedInputs,
  useSendSharedInputs,
} from './shared-inputs.mjs'

import type { LooseArgs, LooseOptions } from './cache-helpers.mjs'
import type { QueryObject, QuerySettings } from './query-object.mjs'

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
  const TKeyBy extends KeyBy<Options> | undefined = undefined,
>(
  endpoint: EndpointHandler<Options>,
  options: QuerySettings<
    SurfaceData<Options, WithResponse>,
    InferEndpointError<Options>,
    WithResponse,
    TKeyBy
  > = {},
): QueryObject<Options, SurfaceData<Options, WithResponse>, InferEndpointError<Options>, TKeyBy> {
  const { keyPrefix, keySuffix, withResponse, keyBy, ...declared } = options
  // The declaration's TanStack options, under whatever a call site passes
  const defaults = declared as LooseOptions
  const keys = createKeyBuilder(
    endpoint.config,
    { keyPrefix, keySuffix, withResponse, keyBy: keyBy as AnyKeyBy | undefined },
    false,
  )
  const call = createCaller(endpoint as never, withResponse)
  // How the inputs take part in the key; `undefined` when all of them do
  const rule = keys.rule

  /**
   * TanStack options for these args. With a `keyBy`, the request uses the
   * entry's shared inputs; `own` are the caller's, for a first request made
   * before anything was sent.
   */
  const build = (args?: LooseArgs, overrides?: LooseOptions, own?: SharedInputs) => {
    const options = { ...defaults, queryKey: keys.key(args), ...overrides }
    return queryOptions({
      ...options,
      queryFn: rule
        ? ({ signal, client }: QueryFunctionContext) =>
            requestShared(entryOf(client, options), rule, own, signal, (inputs) =>
              call({ signal, ...withSharedInputs(args, inputs, rule) }, callOptionsFor(client)),
            )
        : ({ signal, client }: QueryFunctionContext) =>
            call({ signal, ...args }, callOptionsFor(client)),
    })
  }

  /**
   * `queryClient.query` for `fetch` / `prefetch` / `ensure`, with `staleTime`
   * as the caller wants it. Sending shared inputs that the entry's data is not
   * for fetches however fresh the entry is.
   */
  const run = async (
    queryClient: QueryClient,
    args: LooseArgs,
    staleTime?: 'static',
  ): Promise<unknown> => {
    const options = build(args)
    const sent = rule ? sharedInputsOf(args, rule) : undefined
    if (!rule || !sent) {
      return queryClient.query(staleTime ? { ...options, staleTime } : options)
    }
    const entry = entryOf(queryClient, options)
    const { stale } = sendSharedInputs(entry, sent, rule)
    const data = await queryClient.query(
      stale ? { ...options, staleTime: 0 } : staleTime ? { ...options, staleTime } : options,
    )
    // A request cancelled with `revert` (`cancelQueries`, which optimistic
    // updates call) resolves with the data it would have replaced, and that
    // data is for other inputs. Fetch once more.
    return holdsSentInputs(entry) ? data : queryClient.query({ ...options, staleTime: 0 })
  }

  const skipped = (overrides?: LooseOptions) => skippedOptions(keys, defaults, overrides)

  const fetchData = (queryClient: QueryClient, args?: LooseArgs) => run(queryClient, args)

  const query = build as unknown as Record<string, unknown>

  attachCacheHelpers(query, keys, endpoint)

  query.use = rule
    ? (args?: LooseArgs | typeof skipToken, overrides?: LooseOptions) => {
        const queryClient = useQueryClient()
        const options = args === skipToken ? skipped(overrides) : build(args, overrides)
        const sent = args === skipToken ? undefined : sharedInputsOf(args, rule)
        const result = useQuery(options as never)
        useSendSharedInputs(queryClient, options, rule, sent, false)
        return result
      }
    : (args?: LooseArgs | typeof skipToken, overrides?: LooseOptions) =>
        useQuery((args === skipToken ? skipped(overrides) : build(args, overrides)) as never)

  query.useSuspense = rule
    ? (args?: LooseArgs, overrides?: LooseOptions) => {
        const queryClient = useQueryClient()
        const sent = sharedInputsOf(args, rule)
        const options = build(args, overrides, sent)
        const result = useSuspenseQuery(options as never)
        useSendSharedInputs(queryClient, options, rule, sent, true)
        return result
      }
    : (args?: LooseArgs, overrides?: LooseOptions) =>
        useSuspenseQuery(build(args, overrides) as never)

  query.fetch = fetchData

  query.prefetch = prefetchFrom(fetchData)

  query.ensure = (queryClient: QueryClient, args?: LooseArgs) => run(queryClient, args, 'static')

  return query as never
}
