import type { BaseEndpointOptions } from '@navios/builder'
import type { DataTag, InvalidateQueryFilters, SkipToken } from '@tanstack/react-query'

import type { EndpointArgs, RequiredKeys } from '../endpoint/types.mjs'

/** A cache key tagged with the data and error types stored under it. */
export type TaggedKey<TData, TError> = DataTag<readonly unknown[], TData, TError>

/** `[args | skipToken, ...Rest]`, with `args` optional when nothing is required. */
export type HookArgsWith<Options extends BaseEndpointOptions, Rest extends unknown[]> = [
  RequiredKeys<EndpointArgs<Options>>,
] extends [never]
  ? [args?: EndpointArgs<Options> | SkipToken, ...rest: Rest]
  : [args: EndpointArgs<Options> | SkipToken, ...rest: Rest]

/** Filters accepted by `invalidate`, minus the key this library builds. */
export type InvalidateFilters = Omit<InvalidateQueryFilters, 'queryKey'>

/** Anything that can produce a cache key: a query or an infinite query. */
export type AnyQueryObject = { key: (args?: any) => readonly unknown[] }
