import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

import { EndpointError } from './endpoint-error.mjs'

import type { HttpEndpointError } from './endpoint-error.mjs'

/**
 * Type guard for {@link EndpointError}. Use it in a `catch` block, where the
 * caught value is `unknown`.
 *
 * @example
 * ```ts
 * try {
 *   await getUser({ urlParams: { userId } })
 * } catch (error) {
 *   if (isEndpointError(error) && error.kind === 'aborted') return
 *   throw error
 * }
 * ```
 */
export function isEndpointError(error: unknown): error is EndpointError {
  return error instanceof EndpointError
}

/**
 * Type guard for the `http` variant: the server answered with a status
 * declared in `errorSchema` and the body parsed.
 *
 * With a `status` argument it narrows `status` to that literal, which in turn
 * narrows `body` to the matching schema output.
 */
export function isHttpError<
  E extends ErrorSchemaRecord = ErrorSchemaRecord,
  S extends keyof E & number = keyof E & number,
>(error: unknown, status?: S): error is HttpEndpointError<E> & { status: S } {
  if (!(error instanceof EndpointError) || error.kind !== 'http') return false
  return status === undefined ? true : error.status === status
}
