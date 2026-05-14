import type { z } from 'zod/v4'
import type { $ZodIssue } from 'zod/v4/core'

import type { ErrorSchemaRecord } from './error-schema.mjs'

/**
 * HTTP error variant: server responded with a status code that matches one of
 * the schemas in the endpoint's `errorSchema` record. The `body` is the parsed
 * Zod output for that status, with `status` injected at the type level so
 * `error.body.status` is discriminating.
 *
 * Distributed per-key so that narrowing on `status` also narrows `body`:
 * `if (v.status === 404)` refines the whole variant, not just the field.
 */
export type HttpErrorVariant<E extends ErrorSchemaRecord = ErrorSchemaRecord> = {
  [K in keyof E & number]: {
    readonly kind: 'http'
    readonly status: K
    readonly body: z.output<E[K]> & { readonly status: K }
  }
}[keyof E & number]

/**
 * HTTP error variant where the server responded with a status code that does
 * not match any schema in the endpoint's `errorSchema`. The `body` is left as
 * `unknown` because no schema applied.
 */
export interface UnknownHttpErrorVariant {
  readonly kind: 'http-unknown'
  readonly status: number
  readonly body: unknown
}

/**
 * Validation error variant: the server responded with a status that matched a
 * schema, but the body failed to parse. Carries the raw `issues` and the
 * original `body` for diagnostics.
 */
export interface ValidationErrorVariant {
  readonly kind: 'validation'
  readonly status: number
  readonly issues: readonly $ZodIssue[]
  readonly body: unknown
}

/**
 * Network error variant: the request never produced an HTTP response (e.g.
 * DNS failure, connection refused, abort). Carries the original `cause`.
 */
export interface NetworkErrorVariant {
  readonly kind: 'network'
  readonly cause: unknown
}

/**
 * Tagged-union of all error variants surfaced in a `ResponseEnvelope.error`
 * when an endpoint is declared with `result: 'envelope'`.
 *
 * When `E` is undefined the `http` variant is dropped from the union since no
 * typed body can be produced.
 */
export type EnvelopeError<E extends ErrorSchemaRecord | undefined = undefined> =
  | (E extends ErrorSchemaRecord ? HttpErrorVariant<E> : never)
  | UnknownHttpErrorVariant
  | ValidationErrorVariant
  | NetworkErrorVariant
