/**
 * Metadata about an HTTP response. Always present on a successful
 * {@link SafeResult}; `null` on a failure where no response was received
 * (network failure, abort, request validation, missing client).
 */
export interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}

export interface SafeResultOk<TData> {
  readonly ok: true
  readonly data: TData
  readonly error: null
  readonly response: ResponseMeta
}

export interface SafeResultErr<TError> {
  readonly ok: false
  readonly data: null
  readonly error: TError
  readonly response: ResponseMeta | null
}

/**
 * What `endpoint.safe(...)` resolves to. It never rejects: every failure —
 * including invalid input and a missing client — arrives as `ok: false`.
 *
 * Narrow on `ok` (or on `error === null`).
 */
export type SafeResult<TData, TError> = SafeResultOk<TData> | SafeResultErr<TError>
