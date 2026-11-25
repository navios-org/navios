import type { BaseEndpointOptions, Client, EndpointHandler } from '@navios/builder'

/**
 * Data delivered when a query or mutation is declared with
 * `withResponse: true`: the endpoint's data plus the response metadata.
 *
 * Headers are a plain record (lower-cased names), so the value survives
 * dehydration, persistence and structural sharing.
 */
export interface DataWithResponse<TData> {
  data: TData
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
  }
}

/** `TData`, or `TData` wrapped with its response when `WithResponse` is true. */
export type MaybeWithResponse<TData, WithResponse extends boolean> = WithResponse extends true
  ? DataWithResponse<TData>
  : TData

type LooseCall = (args?: unknown, options?: { client: Client }) => Promise<unknown>

/**
 * Wraps an endpoint for use as a query or mutation function. Failures are
 * always thrown as the endpoint's `EndpointError`.
 *
 * @internal
 */
export function createCaller(
  endpoint: EndpointHandler<BaseEndpointOptions>,
  withResponse: boolean | undefined,
): LooseCall {
  if (!withResponse) {
    return endpoint as unknown as LooseCall
  }
  const safe = endpoint.safe as unknown as (
    args?: unknown,
    options?: { client: Client },
  ) => ReturnType<EndpointHandler<BaseEndpointOptions>['safe']>

  return async (args, options) => {
    const result = await safe(args, options)
    if (!result.ok) {
      throw result.error
    }
    const { status, statusText, headers } = result.response
    return {
      data: result.data,
      response: { status, statusText, headers: Object.fromEntries(headers.entries()) },
    } satisfies DataWithResponse<unknown>
  }
}
