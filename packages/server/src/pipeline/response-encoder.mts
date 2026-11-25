import type { RequestContext } from '../context/request-context.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

/**
 * Turns a result of a custom response kind into one an adapter can write
 * (`json`, `text`, `blob`, `stream` or `empty`). A handler produces such a
 * result with `result(kind, body)`. The encoder runs inside the pipeline with
 * the request context, so it may read request state, and an error it throws
 * is mapped to a response like any other.
 */
export type ResponseEncoder = (
  result: RouteResult,
  ctx: RequestContext,
) => RouteResult | Promise<RouteResult>
