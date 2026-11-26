import { settledWithin } from '@navios/core/transport'

import { toTestMessage, toTestResponse } from '../adapter/test-exchange.mjs'
import { parseQuery } from '../decoding/parse-query.mjs'
import { readParts } from '../decoding/read-parts.mjs'
import { malformedPath } from '../decoding/request-errors.mjs'
import { problem } from '../errors/problem.mjs'
import { encodeResult } from '../pipeline/encode-result.mjs'
import { canonicalPath } from '../routing/route-path.mjs'
import { RouteTable } from '../routing/route-table.mjs'

import type { CompiledRoute, RouteExecutor } from '../adapter/compiled-route.mjs'
import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
} from '../adapter/http-adapter.mjs'
import type { BodySource, RouteInput } from '../adapter/route-input.mjs'
import type { RouteBody, RouteResponse } from '../adapter/route-response.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'

export interface InMemoryEnvironment extends HttpAdapterEnvironment {
  raw: { request: TestRequest }
  server: null
  listenOptions: never
}

async function readBody(body: RouteBody): Promise<string> {
  if (body === null || typeof body === 'string') {
    return body ?? ''
  }
  if (body instanceof Blob) {
    return body.text()
  }
  const decoder = new TextDecoder()
  if (body instanceof Uint8Array) {
    return decoder.decode(body)
  }
  let text = ''
  for await (const chunk of body) {
    text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
  }
  return text
}

function bodySource(bytes: Uint8Array | undefined, contentType: string | undefined): BodySource {
  return {
    contentType,
    isEmpty: bytes === undefined || bytes.byteLength === 0,
    bytes: () => bytes ?? new Uint8Array(),
    parts: () => readParts(bytes ?? new Uint8Array(), contentType ?? ''),
  }
}

/**
 * An adapter with no server. It serves `inject()` calls directly, which makes
 * it the fastest way to test an application. A request goes through what a
 * request over HTTP goes through: its body is bytes that the server decodes,
 * and the topics of the conformance suite that need no connection run on it.
 */
export class InMemoryAdapter implements HttpAdapter<InMemoryEnvironment> {
  readonly server = null
  private readonly routes = new RouteTable<RouteExecutor>()
  private notFound: RouteExecutor | null = null
  private inFlight = 0
  private closed = false
  private idle: (() => void) | null = null

  register(route: CompiledRoute): void {
    this.routes.add(route.info.method, route.path, route.execute)
  }

  setNotFound(execute: RouteExecutor): void {
    this.notFound = execute
  }

  async ready(): Promise<void> {}

  async listen(): Promise<string> {
    throw new Error('[Navios] The in-memory adapter has no server; use app.inject()')
  }

  async inject(request: TestRequest): Promise<TestResponse> {
    if (this.closed) {
      throw new Error('[Navios] The application is closed')
    }
    this.inFlight++
    let response: RouteResponse | undefined
    try {
      response = await this.handle(request)
      const text = request.method.toUpperCase() === 'HEAD' ? '' : await readBody(response.body)
      return toTestResponse(response.status, response.headers, text)
    } finally {
      await response?.release?.()
      this.inFlight--
      if (this.inFlight === 0) {
        this.idle?.()
      }
    }
  }

  private async handle(request: TestRequest): Promise<RouteResponse> {
    const { method, url, headers, bytes } = await toTestMessage(request)
    const path = canonicalPath(url.pathname)
    let match: ReturnType<typeof this.routes.match>
    try {
      match = this.routes.match(method, path)
    } catch {
      return encodeResult(malformedPath(path))
    }
    const signal = new AbortController().signal
    const input: RouteInput = {
      method,
      path,
      url: () => url.href,
      remoteAddress: () => request.remoteAddress,
      header: (name) => headers[name.toLowerCase()],
      headers: () => new Headers(Object.entries(headers)),
      headerRecord: () => ({ ...headers }),
      urlParams: match?.urlParams ?? {},
      query: () => parseQuery(url.search),
      body: bodySource(bytes, headers['content-type']),
      signal: () => signal,
      raw: { request },
    }
    const execute = match?.value ?? this.notFound
    return execute === null ? encodeResult(problem(404)) : execute(input)
  }

  async close(timeoutMs: number): Promise<void> {
    this.closed = true
    if (this.inFlight === 0) {
      return
    }
    const idle = new Promise<void>((resolve) => {
      this.idle = resolve
    })
    await settledWithin(idle, timeoutMs)
  }
}

/**
 * The adapter definition for tests and for applications that are only driven
 * through `app.inject()`.
 */
export function defineInMemoryEnvironment(): AdapterDefinition<InMemoryEnvironment> {
  return { create: () => new InMemoryAdapter() }
}
