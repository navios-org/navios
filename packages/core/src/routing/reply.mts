const endpointReplyBrand: unique symbol = Symbol.for('navios.core.EndpointReply')

/**
 * A handler's answer with an explicit status, created with `reply()`.
 */
export interface EndpointReply<Status extends number = number, Body = unknown> {
  readonly [endpointReplyBrand]: true
  readonly status: Status
  readonly body: Body
}

/**
 * Answers with a specific status. The status must be declared by the
 * endpoint, either in `responses` or in `errorSchema`.
 *
 * ```ts
 * return reply(201, user)
 * return reply(404, { message: 'User not found' })
 * ```
 */
export function reply<const Status extends number>(status: Status): EndpointReply<Status, undefined>
export function reply<const Status extends number, Body>(
  status: Status,
  body: Body,
): EndpointReply<Status, Body>
export function reply(status: number, body?: unknown): EndpointReply<number, unknown> {
  return { [endpointReplyBrand]: true, status, body }
}

export function isEndpointReply(value: unknown): value is EndpointReply {
  return typeof value === 'object' && value !== null && endpointReplyBrand in value
}

const customResultBrand: unique symbol = Symbol.for('navios.core.CustomResult')

/**
 * A handler's answer of a custom response kind, created with `result()`. A
 * response encoder registered for that kind turns it into something an
 * adapter can write.
 */
export interface CustomResult<Kind extends string = string, Body = unknown> {
  readonly [customResultBrand]: true
  readonly kind: Kind
  readonly body: Body
  readonly status: number
  readonly headers: Record<string, string> | undefined
}

/**
 * Answers a `response: 'text' | 'stream' | 'blob'` endpoint with a value of
 * a custom kind, for which a plugin has registered an encoder with
 * `api.encoder(kind, encoder)`. Packages wrap this in their own helper, for
 * example `xml(<Feed />)`.
 */
export function result<const Kind extends string, Body>(
  kind: Kind,
  body: Body,
  options: { status?: number; headers?: Record<string, string> } = {},
): CustomResult<Kind, Body> {
  return {
    [customResultBrand]: true,
    kind,
    body,
    status: options.status ?? 200,
    headers: options.headers,
  }
}

export function isCustomResult(value: unknown): value is CustomResult {
  return typeof value === 'object' && value !== null && customResultBrand in value
}
