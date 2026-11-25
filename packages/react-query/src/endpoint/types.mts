import type {
  BaseEndpointOptions,
  ClientRequestArgs,
  InferEndpointError,
  InferEndpointReturn,
} from '@navios/builder'

/** Keys of `T` that must be provided. */
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

/** The full call arguments of an endpoint. */
export type EndpointArgs<Options extends BaseEndpointOptions> = ClientRequestArgs<Options>

/**
 * `[args, ...Rest]`, with `args` optional when the endpoint requires nothing.
 */
export type ArgsWith<Options extends BaseEndpointOptions, Rest extends unknown[] = []> = [
  RequiredKeys<EndpointArgs<Options>>,
] extends [never]
  ? [args?: EndpointArgs<Options>, ...rest: Rest]
  : [args: EndpointArgs<Options>, ...rest: Rest]

/**
 * The part of the call arguments that identifies a request and therefore
 * goes into the cache key: `urlParams`, `params` and `data`.
 */
export type EndpointInputs<Options extends BaseEndpointOptions> = Pick<
  EndpointArgs<Options>,
  Extract<keyof EndpointArgs<Options>, 'urlParams' | 'params' | 'data'>
>

/**
 * Any subset of an endpoint's inputs. Used to address a group of cache
 * entries, e.g. every entry for one `userId` regardless of query params.
 */
export type PartialEndpointInputs<Options extends BaseEndpointOptions> = {
  [K in keyof EndpointInputs<Options>]?: Partial<EndpointInputs<Options>[K]>
}

/** Data an endpoint resolves to. */
export type EndpointData<Options extends BaseEndpointOptions> = InferEndpointReturn<Options>

/** The typed `EndpointError` an endpoint fails with. */
export type EndpointFailure<Options extends BaseEndpointOptions> = InferEndpointError<Options>
