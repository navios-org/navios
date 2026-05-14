/**
 * Metadata about an HTTP response. Always present on successful envelopes;
 * may be null on error envelopes that represent a network or pre-flight failure
 * where no response was received.
 */
export interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}

export interface ResponseEnvelopeOk<TData> {
  readonly ok: true
  readonly data: TData
  readonly error: null
  readonly response: ResponseMeta
}

export interface ResponseEnvelopeErr<TError> {
  readonly ok: false
  readonly data: null
  readonly error: TError
  readonly response: ResponseMeta | null
}

/**
 * Discriminated union of success and error envelopes for endpoints declared
 * with `result: 'envelope'`. Use `ok` or check `error` for null to narrow.
 */
export type ResponseEnvelope<TData, TError> =
  | ResponseEnvelopeOk<TData>
  | ResponseEnvelopeErr<TError>
