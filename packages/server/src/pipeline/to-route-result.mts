import { isEndpointReply } from '../responses/reply.mjs'

import type { RouteResult } from '../routing/route-result.mjs'

/**
 * What an interceptor, an encoder, an error mapper or an error responder
 * answered with, as a result. A `reply()` is one too. Anything else is a
 * defect of whoever answered, named by `who`.
 */
export function toRouteResult(
  value: unknown,
  who: () => string,
  advice = 'Return reply(status, body), problem(status, detail) or a RouteResult.',
): RouteResult {
  const candidate = value as Partial<RouteResult> | null | undefined
  if (typeof candidate?.kind === 'string' && typeof candidate.status === 'number') {
    return candidate as RouteResult
  }
  if (isEndpointReply(value)) {
    return value.body === undefined
      ? { status: value.status, body: undefined, kind: 'empty' }
      : { status: value.status, body: value.body, kind: 'json' }
  }
  throw new Error(`[Navios] ${who()} did not return a response. ${advice}`)
}
