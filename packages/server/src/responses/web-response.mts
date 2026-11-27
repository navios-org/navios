import type { RequestContext } from '../context/request-context.mjs'
import type { ResponseHeaders, RouteResult } from '../routing/route-result.mjs'

/**
 * Headers of a `Response` that describe its connection or the framing of its
 * body. The adapter writes those itself; `set-cookie` is read on its own.
 */
const DROPPED = new Set([
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
])

/**
 * The result of a handler that returned a Web `Response`: its status, its
 * headers over those of `ctx.reply`, every `set-cookie` of both, and its body
 * as a stream the request owns.
 * @internal
 */
export function fromWebResponse(response: Response, ctx: RequestContext): RouteResult {
  const headers: ResponseHeaders = {}
  response.headers.forEach((value, name) => {
    if (!DROPPED.has(name)) {
      headers[name] = value
    }
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) {
    // Over those of `ctx.reply` like every header, so its cookies are kept here.
    const set = ctx.responseHeaders?.['set-cookie']
    headers['set-cookie'] = set === undefined ? cookies : [set, cookies].flat()
  }
  const { status, body } = response
  if (body === null) {
    return { status, headers, body: undefined, kind: 'empty' }
  }
  ctx.ownBody(body)
  return { status, headers, body, kind: 'stream' }
}
