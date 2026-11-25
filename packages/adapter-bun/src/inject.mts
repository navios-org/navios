import type { TestRequest, TestResponse } from '@navios/server'

import { pathOf } from './request-input.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A registered route, as `inject()` matches it. */
export interface Matcher {
  method: string
  pattern: RegExp
  names: string[]
  /** For each segment of the path, whether it is a url param. */
  params: boolean[]
  handle: (request: Request, params: Record<string, string>) => Response | Promise<Response>
}

export function compilePath(path: string): Pick<Matcher, 'pattern' | 'names' | 'params'> {
  const names: string[] = []
  const params: boolean[] = []
  const source = path
    .split('/')
    .map((segment) => {
      const isParam = segment.startsWith('$')
      params.push(isParam)
      if (isParam) {
        names.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  // The whole path, as `Bun.serve` matches it: `/users/` is not `/users`.
  return { pattern: new RegExp(`^${source || '/'}$`), names, params }
}

/**
 * Decodes a url param as `Bun.serve` does: a sequence that is not valid
 * percent-encoded UTF-8 does not fail the request.
 */
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    const bytes = value.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    return new TextDecoder().decode(Uint8Array.from(bytes, (char) => char.charCodeAt(0)))
  }
}

/**
 * Whether `route` is a closer match than `other` for a path both match: at
 * the first segment where one is static and the other a url param, the static
 * one wins, as in the router of `Bun.serve`. `inject()` has to choose the
 * route that a request over HTTP would reach.
 */
function isMoreSpecific(route: Matcher, other: Matcher): boolean {
  const length = Math.min(route.params.length, other.params.length)
  for (let index = 0; index < length; index++) {
    if (route.params[index] !== other.params[index]) {
      return other.params[index]
    }
  }
  return false
}

/**
 * Runs a test request in process: through the route that a request over HTTP
 * would reach, or through `fallback` when no route matches.
 */
export async function injectRequest(
  request: TestRequest,
  matchers: Matcher[],
  fallback: (request: Request) => Promise<Response>,
): Promise<TestResponse> {
  const { body } = request
  const headers = new Headers(request.headers)
  let payload: any
  if (body !== undefined && body !== null) {
    if (
      typeof body === 'string' ||
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ReadableStream
    ) {
      payload = body
    } else {
      payload = JSON.stringify(body)
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
      }
    }
  }
  const native = new Request(new URL(request.url, 'http://localhost'), {
    method: request.method,
    headers,
    body: payload,
  })
  const path = pathOf(native.url)
  const method = native.method.toUpperCase()
  let matched: Matcher | null = null
  let captures: RegExpExecArray | null = null
  for (const matcher of matchers) {
    if (matcher.method !== method) {
      continue
    }
    const match = matcher.pattern.exec(path)
    if (match && (matched === null || isMoreSpecific(matcher, matched))) {
      matched = matcher
      captures = match
    }
  }
  let response: Response
  if (matched !== null && captures !== null) {
    const values = captures
    const params: Record<string, string> = {}
    matched.names.forEach((name, index) => {
      params[name] = decodeParam(values[index + 1])
    })
    response = await matched.handle(native, params)
  } else {
    response = await fallback(native)
  }

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    responseHeaders[name] = value
  })
  const text = await response.text()
  let parsed: unknown
  if ((responseHeaders['content-type'] ?? '').includes('json') && text !== '') {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
  }
  return { status: response.status, headers: responseHeaders, text, body: parsed }
}
