import type {
  EnvelopeError,
  HttpErrorVariant,
  NetworkErrorVariant,
  UnknownHttpErrorVariant,
  ValidationErrorVariant,
} from '../types/envelope-error.mjs'
import type { ResponseEnvelope } from '../types/envelope.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Type guard for the `http` envelope error variant.
 *
 * When called with a `status`, narrows both `kind` to `'http'` and `status`
 * to the literal, which in turn narrows `body` to the matching schema output
 * (since `HttpErrorVariant<E>` is a distributive per-key union).
 */
export function isHttpError<
  E extends ErrorSchemaRecord = ErrorSchemaRecord,
  S extends keyof E & number = keyof E & number,
>(error: unknown, status?: S): error is HttpErrorVariant<E> & { status: S } {
  if (!isObj(error) || error.kind !== 'http') return false
  return status === undefined ? true : error.status === status
}

/**
 * Type guard for the `http-unknown` envelope error variant: the server
 * responded with a status that does not match any schema in `errorSchema`.
 */
export function isUnknownHttpError(error: unknown): error is UnknownHttpErrorVariant {
  return isObj(error) && error.kind === 'http-unknown'
}

/**
 * Type guard for the `validation` envelope error variant: the response status
 * matched a schema but the body failed to parse.
 */
export function isValidationError(error: unknown): error is ValidationErrorVariant {
  return isObj(error) && error.kind === 'validation'
}

/**
 * Type guard for the `network` envelope error variant: the request never
 * produced an HTTP response.
 */
export function isNetworkError(error: unknown): error is NetworkErrorVariant {
  return isObj(error) && error.kind === 'network'
}

/**
 * Type guard for any envelope error variant.
 */
export function isEnvelopeError(error: unknown): error is EnvelopeError {
  return (
    isHttpError(error) ||
    isUnknownHttpError(error) ||
    isValidationError(error) ||
    isNetworkError(error)
  )
}

/**
 * Runtime type guard for `ResponseEnvelope` shape. Returns true if the value
 * looks like an envelope (has the four discriminator-relevant keys).
 *
 * Used by consumers (e.g. `@navios/react-query`) to branch behaviour for
 * envelope-mode endpoints without importing endpoint config metadata.
 */
export function isResponseEnvelope(v: unknown): v is ResponseEnvelope<unknown, unknown> {
  return isObj(v) && 'ok' in v && 'data' in v && 'error' in v && 'response' in v
}
