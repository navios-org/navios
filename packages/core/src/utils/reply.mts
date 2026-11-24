import type { ZodType } from 'zod/v4'

/**
 * Brand carried by every object {@link reply} creates. Registered globally so
 * a reply is recognised even when two copies of `@navios/core` are loaded.
 */
const endpointReplyBrand: unique symbol = Symbol.for('navios.core.EndpointReply')

/**
 * The value a controller method returns from an endpoint declared with a
 * per-status `responses` map: the status to answer with and its body.
 * Created with {@link reply}.
 *
 * @typeParam Status - The HTTP status.
 * @typeParam Body - The response body; `undefined` for a status without one.
 */
export interface EndpointReply<Status extends number = number, Body = unknown> {
  readonly [endpointReplyBrand]: true
  readonly status: Status
  readonly body: Body
}

/**
 * Picks the status (and body) an endpoint declared with a per-status
 * `responses` map answers with.
 *
 * The status must be one of the declared ones. For a status declared with a
 * schema the body is required and is validated with that schema; for a status
 * declared as `null` there is no body.
 *
 * @param status - One of the statuses in the endpoint's `responses` map.
 * @param body - The body for that status. Omit it for a `null` entry.
 *
 * @example
 * ```typescript
 * const putUser = api.declareEndpoint({
 *   method: 'PUT',
 *   url: '/users/$id',
 *   requestSchema: userInputSchema,
 *   responses: { 200: userSchema, 201: createdSchema, 204: null },
 * })
 *
 * @Controller()
 * export class UserController {
 *   @Endpoint(putUser)
 *   async putUser(request: EndpointParams<typeof putUser>): EndpointResult<typeof putUser> {
 *     const result = await this.users.put(request.urlParams.id, request.data)
 *     if (result.unchanged) return reply(204)
 *     if (result.created) return reply(201, { id: result.user.id })
 *     return reply(200, result.user)
 *   }
 * }
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

/**
 * Tells whether a value was created with {@link reply}. Adapters use it to
 * check what a `responses` endpoint returned.
 */
export function isEndpointReply(value: unknown): value is EndpointReply {
  return typeof value === 'object' && value !== null && endpointReplyBrand in value
}

/** What an adapter needs to answer a `responses` endpoint. */
export interface ResolvedEndpointReply {
  status: number
  /** The schema declared for the status; `null` when it has no body. */
  schema: ZodType | null
  /** The body passed to {@link reply}. Not sent when `schema` is `null`. */
  body: unknown
}

/**
 * Matches what the handler of a `responses` endpoint returned against the
 * endpoint's declaration. Meant for HTTP adapters.
 *
 * @param config - The endpoint's declaration; it must have a `responses` map.
 * @param result - What the controller method returned.
 * @throws {Error} naming the endpoint when `result` was not created with
 *   {@link reply}, or when its status is not in the `responses` map. Adapters
 *   let it reach their error handling, which answers 500.
 */
export function resolveEndpointReply(
  config: { method: string; url: string; responses?: Record<number, ZodType | null> },
  result: unknown,
): ResolvedEndpointReply {
  const responses = config.responses ?? {}
  const endpoint = `${config.method} ${config.url}`

  if (!isEndpointReply(result)) {
    const returned =
      result === null
        ? 'null'
        : Array.isArray(result)
          ? 'an array'
          : `a value of type ${typeof result}`
    throw new Error(
      `[Navios] ${endpoint} is declared with a per-status responses map, so its handler must return reply(status, body), but it returned ${returned}.`,
    )
  }
  if (!Object.hasOwn(responses, result.status)) {
    throw new Error(
      `[Navios] ${endpoint} replied with status ${result.status}, which is not in its responses map (declared: ${Object.keys(responses).join(', ')}).`,
    )
  }
  return { status: result.status, schema: responses[result.status], body: result.body }
}
