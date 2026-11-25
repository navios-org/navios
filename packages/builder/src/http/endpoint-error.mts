import { NaviosError } from '../shared/navios-error.mjs'
import { toSchemaIssue } from '../shared/schema.mjs'

import type { InferSchemaOutput, SchemaIssue, StandardIssue } from '../shared/schema.mjs'

import type { HttpMethod } from './client.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'
import type { ResponseMeta } from './response-meta.mjs'

/**
 * Why a request failed.
 *
 * - `http` — non-2xx status that matched `errorSchema`; `body` is the parsed schema output.
 * - `http-unknown` — non-2xx status with no schema; `body` is the raw payload.
 * - `request-validation` — `urlParamsSchema`, `querySchema` or `requestSchema`
 *   rejected the input. No request was sent.
 * - `response-validation` — a 2xx body failed `responseSchema` (or its entry
 *   in `responses`), a 2xx body could not be parsed by the client (HTML where
 *   JSON was expected), a 2xx status is not declared in `responses`, or an
 *   error body failed its `errorSchema` entry.
 * - `network` — no complete response was received and the request was not
 *   cancelled, or an interceptor of the client threw.
 * - `timeout` — the request timed out.
 * - `aborted` — the request was cancelled through its `AbortSignal`.
 * - `config` — the call could not be made: no client was provided, a URL
 *   parameter is missing or cannot be part of a URL, or the body cannot be
 *   serialised.
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

/** The part of a call's arguments a validation issue belongs to. */
export type RequestPart = 'urlParams' | 'params' | 'data'

/** A validation issue of an {@link EndpointError}. */
export interface EndpointIssue extends SchemaIssue {
  /** Set for `request-validation`. `path` starts inside this part. */
  readonly part?: RequestPart
}

export interface EndpointErrorInit {
  kind: EndpointErrorKind
  endpoint: { method: HttpMethod; url: string }
  message?: string
  status?: number
  body?: unknown
  response?: ResponseMeta | null
  issues?: readonly (StandardIssue & { part?: RequestPart })[]
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

/** A session is in there, and the result of `toJSON()` ends up in logs. */
const COOKIE_HEADER = /^set-cookie2?$/i

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
  declare readonly issues?: readonly EndpointIssue[]

  constructor(init: EndpointErrorInit) {
    super(init.message ?? defaultMessage(init), { cause: init.cause })
    this.name = 'EndpointError'
    this.kind = init.kind
    this.endpoint = init.endpoint
    this.response = init.response ?? null
    if (init.status !== undefined) this.status = init.status
    if ('body' in init) this.body = init.body
    if (init.issues !== undefined) {
      this.issues = init.issues.map((issue) => ({
        ...toSchemaIssue(issue),
        ...(issue.part !== undefined ? { part: issue.part } : {}),
      }))
    }
  }

  /**
   * Plain-object form without `cause`, with headers flattened to a record and
   * without `set-cookie`.
   * Safe to pass through `JSON.stringify`, React Query dehydration and loggers,
   * as long as `body` itself is serializable.
   */
  toJSON(): {
    name: string
    message: string
    kind: EndpointErrorKind
    endpoint: { method: HttpMethod; url: string }
    status?: number
    body?: unknown
    issues?: readonly EndpointIssue[]
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
            headers: Object.fromEntries(
              [...this.response.headers].filter(([name]) => !COOKIE_HEADER.test(name)),
            ),
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
  readonly issues: readonly (EndpointIssue & { readonly part: RequestPart })[]
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

// =============================================================================
// Type guards
// =============================================================================

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
