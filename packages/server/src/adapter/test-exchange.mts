import { isJsonType, mediaType } from '../decoding/media-type.mjs'

import type { TestRequest, TestResponse } from './test-request.mjs'

function isSentAsIs(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  )
}

/** What a test request is over HTTP. */
export interface TestMessage {
  /** In upper case. */
  readonly method: string
  readonly url: URL
  /** By lower-case name, without a prototype. */
  readonly headers: Record<string, string>
  /** The body. `undefined` when there is none, as for a `GET`. */
  readonly bytes: Uint8Array<ArrayBuffer> | undefined
}

/** Turns a test request into what is sent over HTTP. */
export async function toTestMessage(request: TestRequest): Promise<TestMessage> {
  const method = request.method.toUpperCase()
  // A path with two slashes at the start is not a host.
  const url = new URL(
    request.url.startsWith('/') ? `http://localhost${request.url}` : request.url,
    'http://localhost',
  )
  const headers: Record<string, string> = Object.create(null)
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers[name.toLowerCase()] = String(value)
  }
  const { body } = request
  if (body === undefined || body === null || method === 'GET' || method === 'HEAD') {
    return { method, url, headers, bytes: undefined }
  }
  const asIs = isSentAsIs(body)
  const response = new Response(asIs ? body : JSON.stringify(body))
  let contentType: string | null = 'application/json'
  if (asIs) {
    // Read before the body is, and not for a string: Bun has none then.
    contentType =
      typeof body === 'string' ? 'text/plain;charset=UTF-8' : response.headers.get('content-type')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (contentType !== null) {
    headers['content-type'] ??= contentType
  }
  headers['content-length'] ??= String(bytes.byteLength)
  return { method, url, headers, bytes }
}

/**
 * What `inject()` answers with. The values of a repeated header are joined
 * with `, `, those of `set-cookie` with a line break.
 */
export function toTestResponse(
  status: number,
  headers: Readonly<Record<string, string | number | readonly string[] | undefined>>,
  text: string,
): TestResponse {
  const joined: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      joined[name] =
        typeof value === 'object' ? value.join(name === 'set-cookie' ? '\n' : ', ') : String(value)
    }
  }
  const type = mediaType(joined['content-type'])
  let body: unknown
  if (type !== undefined && isJsonType(type) && text !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
  }
  const cookies = [headers['set-cookie'] ?? []].flat().map(String)
  return { status, headers: joined, cookies, text, body }
}
