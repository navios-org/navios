import type { HttpMethod } from '../types/common.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import type { ResponseMeta } from '../types/result.mjs'
import type { InferSchemaOutput, SchemaIssue } from '../types/schema.mjs'

import { NaviosError } from './navios-error.mjs'

/**
 * Why a request failed.
 *
 * - `http` — non-2xx status that matched `errorSchema`; `body` is the parsed schema output.
 * - `http-unknown` — non-2xx status with no schema; `body` is the raw payload.
 * - `request-validation` — `urlParamsSchema`, `querySchema` or `requestSchema`
 *   rejected the input. No request was sent.
 * - `response-validation` — a 2xx body failed `responseSchema` (or its entry
 *   in `responses`), a 2xx status is not declared in `responses`, or an error
 *   body failed its `errorSchema` entry.
 * - `network` — no response was received and the request was not cancelled.
 * - `timeout` — the request timed out.
 * - `aborted` — the request was cancelled through its `AbortSignal`.
 * - `config` — the call could not be made: no client was provided, or a
 *   required URL parameter is missing.
 */
export type EndpointErrorKind =
  | 'http'
  | 'http-unknown'
  | 'request-validation'
  | 'response-validation'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'config'

export interface EndpointErrorInit {
  kind: EndpointErrorKind
  endpoint: { method: HttpMethod; url: string }
  message?: string
  status?: number
  body?: unknown
  response?: ResponseMeta | null
  issues?: readonly SchemaIssue[]
  cause?: unknown
}

function defaultMessage(init: EndpointErrorInit): string {
  const target = `${init.endpoint.method} ${init.endpoint.url}`
  switch (init.kind) {
    case 'http':
    case 'http-unknown':
      return `${target} failed with status ${init.status}`
    case 'request-validation':
      return `${target} was not sent: request validation failed`
    case 'response-validation':
      return `${target} returned a body that failed validation (status ${init.status})`
    case 'timeout':
      return `${target} timed out`
    case 'aborted':
      return `${target} was aborted`
    case 'config':
      return `${target} could not be called`
    default:
      return `${target} failed: no response received`
  }
}

/**
 * The single error type for a failed endpoint call.
 *
 * It is thrown by `endpoint(args)`, returned as `result.error` by
 * `endpoint.safe(args)`, and passed to the builder's `onError` hook.
 *
 * `body` is exactly what the matching `errorSchema` entry produced (or the raw
 * payload when there is no schema) — the builder never adds or rewrites
 * fields on it. Discriminate on `error.kind` and `error.status`.
 *
 * For a typed view over an endpoint's `errorSchema`, see {@link EndpointErrorOf}.
 */
export class EndpointError extends NaviosError {
  readonly kind: EndpointErrorKind
  /** Method and URL template of the endpoint that failed. */
  readonly endpoint: { readonly method: HttpMethod; readonly url: string }
  /** HTTP status, when a response was received. */
  declare readonly status?: number
  /** Response body: schema output for `http`, raw payload otherwise. */
  declare readonly body?: unknown
  /** Response metadata, or `null` when no response was received. */
  readonly response: ResponseMeta | null
  /** Validation issues for `request-validation` and `response-validation`. */
  declare readonly issues?: readonly SchemaIssue[]

  constructor(init: EndpointErrorInit) {
    super(init.message ?? defaultMessage(init), { cause: init.cause })
    this.name = 'EndpointError'
    this.kind = init.kind
    this.endpoint = init.endpoint
    this.response = init.response ?? null
    if (init.status !== undefined) this.status = init.status
    if ('body' in init) this.body = init.body
    if (init.issues !== undefined) this.issues = init.issues
  }

  /**
   * Plain-object form without `cause`, with headers flattened to a record.
   * Safe to pass through `JSON.stringify`, React Query dehydration and loggers.
   */
  toJSON(): {
    name: string
    message: string
    kind: EndpointErrorKind
    endpoint: { method: HttpMethod; url: string }
    status?: number
    body?: unknown
    issues?: readonly SchemaIssue[]
    response: { status: number; statusText: string; headers: Record<string, string> } | null
  } {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      endpoint: { ...this.endpoint },
      ...(this.status !== undefined ? { status: this.status } : {}),
      ...('body' in this ? { body: this.body } : {}),
      ...(this.issues !== undefined ? { issues: this.issues } : {}),
      response: this.response
        ? {
            status: this.response.status,
            statusText: this.response.statusText,
            headers: Object.fromEntries(this.response.headers.entries()),
          }
        : null,
    }
  }
}

// =============================================================================
// Typed views
// =============================================================================

/**
 * `http` variant: one member per status declared in `errorSchema`, so
 * narrowing on `status` also narrows `body`.
 */
export type HttpEndpointError<E extends ErrorSchemaRecord = ErrorSchemaRecord> = {
  [K in keyof E & number]: EndpointError & {
    readonly kind: 'http'
    readonly status: K
    readonly body: InferSchemaOutput<E[K]>
    readonly response: ResponseMeta
  }
}[keyof E & number]

export type UnknownHttpEndpointError = EndpointError & {
  readonly kind: 'http-unknown'
  readonly status: number
  readonly body: unknown
  readonly response: ResponseMeta
}

export type RequestValidationEndpointError = EndpointError & {
  readonly kind: 'request-validation'
  readonly issues: readonly SchemaIssue[]
  readonly response: null
}

export type ResponseValidationEndpointError = EndpointError & {
  readonly kind: 'response-validation'
  readonly status: number
  readonly issues: readonly SchemaIssue[]
  readonly body: unknown
  readonly response: ResponseMeta
}

export type TransportEndpointError = EndpointError & {
  readonly kind: 'network' | 'timeout' | 'aborted' | 'config'
  readonly response: null
}

/**
 * Discriminated union of every failure an endpoint with error schema `E` can
 * produce. Every member is an {@link EndpointError} instance at runtime.
 *
 * @example
 * ```ts
 * const res = await getUser.safe({ urlParams: { userId } })
 * if (!res.ok) {
 *   if (res.error.kind === 'http' && res.error.status === 404) {
 *     res.error.body // typed from errorSchema[404]
 *   }
 * }
 * ```
 */
export type EndpointErrorOf<E extends ErrorSchemaRecord | undefined = undefined> =
  | (E extends ErrorSchemaRecord ? HttpEndpointError<E> : never)
  | UnknownHttpEndpointError
  | RequestValidationEndpointError
  | ResponseValidationEndpointError
  | TransportEndpointError
