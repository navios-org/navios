import type { BaseEndpointOptions, ClientRequestArgs } from '@navios/builder'

import type { InputPart, KeyedArgs } from './key-by.mjs'

/** Keys of `T` that must be provided. */
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

/** `[args, ...Rest]`, with `args` optional when `Args` requires nothing. */
export type ArgsOf<Args, Rest extends unknown[] = []> = [RequiredKeys<Args>] extends [never]
  ? [args?: Args, ...rest: Rest]
  : [args: Args, ...rest: Rest]

/**
 * The part of the call arguments that identifies a request and therefore
 * goes into the cache key: `urlParams`, `params` and `data`.
 */
export type EndpointInputs<Options extends BaseEndpointOptions> = Pick<
  ClientRequestArgs<Options>,
  Extract<keyof ClientRequestArgs<Options>, 'urlParams' | 'params' | 'data'>
>

/**
 * Any subset of an endpoint's inputs. Used to address a group of cache
 * entries, e.g. every entry for one `userId` regardless of query params.
 */
export type PartialEndpointInputs<Options extends BaseEndpointOptions> = {
  [K in keyof EndpointInputs<Options>]?: Partial<EndpointInputs<Options>[K]>
}

/**
 * Any subset of the inputs that identify an entry under a `keyBy`: the
 * argument of `key` and `invalidate`. Without a `keyBy`, {@link PartialEndpointInputs}.
 */
export type PartialKeyedInputs<Options extends BaseEndpointOptions, TKeyBy> = [TKeyBy] extends [
  undefined,
]
  ? PartialEndpointInputs<Options>
  : {
      [K in Extract<keyof KeyedArgs<Options, TKeyBy>, InputPart>]?: Partial<
        NonNullable<KeyedArgs<Options, TKeyBy>[K]>
      >
    }
