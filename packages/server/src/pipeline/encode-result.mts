import { describeValue } from '../internal/describe-value.mjs'
import { isLazyBody, ManagedBody } from '../responses/managed-body.mjs'
import { isEventStream, setHeader } from '../responses/response-headers.mjs'
import { cookieKey, serializeCookie } from '../responses/serialize-cookie.mjs'

import type { RouteBody, RouteResponse } from '../adapter/route-response.mjs'
import type { RequestContext } from '../context/request-context.mjs'
import type { ResponseHeaders, RouteResult } from '../routing/route-result.mjs'

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
  empty: '',
}

const JSON_HEADERS = Object.freeze({ 'content-type': CONTENT_TYPES.json })
const NO_HEADERS = Object.freeze({})

/** Statuses whose response has no body, whatever the result says. */
function isBodiless(status: number): boolean {
  return status === 204 || status === 205 || status === 304
}

function nameOf(ctx: RequestContext | null): string {
  return ctx === null ? 'The response' : `The response of ${ctx.method} ${ctx.route.path}`
}

/**
 * Encodes a result that belongs to no route: an adapter's own answer to a
 * request that never reached one. Throws for one that cannot be written.
 */
export function encodeResult(result: RouteResult): RouteResponse {
  return encodeResponse(result, null)
}

/**
 * Turns the result of a request into a response that can be written. Throws
 * for one that cannot, so that it is an error of the request like any other.
 * @internal
 */
export function encodeResponse(result: RouteResult, ctx: RequestContext | null): RouteResponse {
  const { status, kind } = result
  // The status of a response that the handler wrote itself has been sent.
  if (
    !(status >= 200 && status <= 599 && Number.isInteger(status)) &&
    !(ctx !== null && ctx.takenOver)
  ) {
    if (ctx !== null) {
      ownResult(result, ctx)
    }
    throw new Error(`[Navios] ${nameOf(ctx)} has the status ${status}, which cannot be sent.`)
  }
  if (
    kind === 'json' &&
    result.headers === undefined &&
    result.cookies === undefined &&
    (ctx === null || (ctx.responseHeaders === null && ctx.responseCookies === null))
  ) {
    const text = isBodiless(status) ? undefined : JSON.stringify(result.body)
    return text === undefined
      ? respond(status, NO_HEADERS, null, ctx)
      : respond(status, JSON_HEADERS, text, ctx)
  }

  // From here on, whatever goes wrong, the request closes the body.
  const owned = ctx === null ? null : ownResult(result, ctx)
  const headers = mergeHeaders(result, ctx)
  const body = isBodiless(status) ? null : encodeBody(result, ctx, owned)
  if (body !== null) {
    headers['content-type'] ??=
      body instanceof Blob && body.type !== '' ? body.type : CONTENT_TYPES[kind]
    if (kind === 'sse') {
      headers['cache-control'] ??= 'no-cache'
      headers['x-accel-buffering'] ??= 'no'
    }
    // Whoever produces the events, a server must not hold back the headers.
    if (body instanceof ManagedBody && (kind === 'sse' || isEventStream(headers))) {
      body.sendsEvents()
    }
  } else if (isBodiless(status)) {
    delete headers['content-type']
    if (status !== 304) {
      delete headers['content-length']
    }
  }
  return respond(status, headers, body, ctx)
}

/**
 * Makes the request the owner of the lazy body of a result, which is then
 * closed with the request whatever becomes of the result. Returns the body as
 * it is sent, or `null` for a result without a lazy body.
 * @internal
 */
export function ownResult({ body, kind }: RouteResult, ctx: RequestContext): ManagedBody | null {
  return kind !== 'json' && isLazyBody(body) ? ctx.ownBody(body) : null
}

function respond(
  status: number,
  headers: RouteResponse['headers'],
  body: RouteBody,
  ctx: RequestContext | null,
): RouteResponse {
  if (ctx === null) {
    const release = body instanceof ManagedBody ? () => body.close() : undefined
    return { status, headers, body, release }
  }
  ctx.respondWith(status)
  if (ctx.needsRelease) {
    const release = () => ctx.release()
    return ctx.takenOver
      ? { status, headers, body, release, takenOver: true }
      : { status, headers, body, release }
  }
  // Nothing will call release(), so nothing may be acquired from here on:
  // detached work that reaches for the request later is refused instead of
  // leaking a scope.
  ctx.released = true
  return { status, headers, body, release: undefined }
}

/** The headers of `ctx.reply` under those of the result, and the cookies of both. */
function mergeHeaders(result: RouteResult, ctx: RequestContext | null): ResponseHeaders {
  if (result.headers === undefined && result.cookies === undefined) {
    const set = ctx?.responseHeaders ?? null
    if (set !== null && ctx!.responseCookies === null) {
      return set
    }
  }
  const headers: ResponseHeaders = { ...ctx?.responseHeaders }
  if (result.headers !== undefined) {
    for (const name of Object.keys(result.headers)) {
      setHeader(headers, name, result.headers[name])
    }
  }
  let cookies = ctx?.responseCookies ?? null
  if (result.cookies !== undefined && result.cookies.length > 0) {
    cookies = new Map(cookies)
    for (const cookie of result.cookies) {
      cookies.set(cookieKey(cookie), serializeCookie(cookie))
    }
  }
  if (cookies !== null) {
    headers['set-cookie'] = [...[headers['set-cookie'] ?? []].flat(), ...cookies.values()]
  }
  return headers
}

/** `owned` is the lazy body of the result, as the request owns it. */
function encodeBody(
  result: RouteResult,
  ctx: RequestContext | null,
  owned: ManagedBody | null,
): RouteBody {
  const { body, kind } = result
  if (kind === 'json') {
    return JSON.stringify(body) ?? null
  }
  if (!Object.hasOwn(CONTENT_TYPES, kind)) {
    throw new Error(
      `[Navios] ${nameOf(ctx)} is of the kind "${kind}", which cannot be sent. The kinds are ` +
        `${Object.keys(CONTENT_TYPES).join(', ')}, and those of the encoders of plugins for what a ` +
        `handler returns.`,
    )
  }
  if (kind === 'empty' || body === undefined || body === null) {
    return null
  }
  if (typeof body === 'string' || body instanceof Uint8Array || body instanceof Blob) {
    return body
  }
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body)
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  }
  if (isLazyBody(body)) {
    return (
      owned ??
      new ManagedBody(body, {
        name: nameOf(ctx),
        step: (source, step) => source[step]() as never,
        failed() {},
        closeFailed() {},
      })
    )
  }
  throw new Error(
    `[Navios] ${nameOf(ctx)} is declared as "${kind}", but its body is ${describeValue(body)}. ` +
      `Return a string, bytes, a Blob, a stream or an async iterable.`,
  )
}
