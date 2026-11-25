const endpointReplyBrand: unique symbol = Symbol.for('navios.server.EndpointReply')

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
