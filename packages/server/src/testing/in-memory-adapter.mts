import { serializeCookie } from '../adapter/serialize-cookie.mjs'
import { problem } from '../errors/problem.mjs'
import { ValidationError } from '../errors/validation-error.mjs'

import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
} from '../adapter/http-adapter.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'
import type { ErrorPipeline } from '../errors/error-pipeline.mjs'
import type { CompiledRoute, RouteExecutor } from '../routing/compiled-route.mjs'
import type { RouteInput } from '../routing/route-input.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

export interface InMemoryEnvironment extends HttpAdapterEnvironment {
  raw: { request: TestRequest }
  server: null
  listenOptions: never
}

interface Registered {
  method: string
  pattern: RegExp
  names: string[]
  /** For each segment of the path, whether it is a url param. */
  params: boolean[]
  execute: RouteExecutor
}

function compilePath(path: string): Pick<Registered, 'pattern' | 'names' | 'params'> {
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
  // The whole path, as the routers of the Fastify and Bun adapters match it:
  // `/users/` is not `/users`.
  return { pattern: new RegExp(`^${source || '/'}$`), names, params }
}

/**
 * Whether `route` is a closer match than `other` for a path both match: at
 * the first segment where one is static and the other a url param, the static
 * one wins. This is what the routers of the Fastify and Bun adapters do, so
 * the order of registration does not matter.
 */
function isMoreSpecific(route: Registered, other: Registered): boolean {
  const length = Math.min(route.params.length, other.params.length)
  for (let index = 0; index < length; index++) {
    if (route.params[index] !== other.params[index]) {
      return other.params[index]
    }
  }
  return false
}

async function readBody(result: RouteResult): Promise<string> {
  const { body, kind } = result
  if (kind === 'empty' || body === undefined) {
    return ''
  }
  if (kind === 'json') {
    return JSON.stringify(body)
  }
  if (body === null) {
    return ''
  }
  if (typeof body === 'string') {
    return body
  }
  if (body instanceof Blob) {
    return body.text()
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body as ArrayBuffer)
  }
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of body as AsyncIterable<unknown>) {
    text +=
      typeof chunk === 'string' ? chunk : decoder.decode(chunk as Uint8Array, { stream: true })
  }
  return text
}

/**
 * The query as the Fastify and Bun adapters give it: a repeated parameter is
 * an array. Without a prototype, since the names come from the client.
 */
function parseQuery(params: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null)
  for (const [name, value] of params) {
    const existing = query[name]
    if (existing === undefined) {
      query[name] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[name] = [existing, value]
    }
  }
  return query
}

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

/**
 * An adapter with no server. It serves `inject()` calls directly, which makes
 * it the fastest way to test an application, and it is the reference
 * implementation of the adapter contract.
 */
export class InMemoryAdapter implements HttpAdapter<InMemoryEnvironment> {
  readonly server = null
  private readonly routes: Registered[] = []
  private notFound: RouteExecutor | null = null
  private inFlight = 0
  private closed = false
  private idle: (() => void) | null = null

  constructor(private readonly errors?: ErrorPipeline) {}

  register(route: CompiledRoute): void {
    this.routes.push({
      method: route.info.method,
      ...compilePath(route.info.path),
      execute: route.execute,
    })
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
    const url = new URL(request.url, 'http://localhost')
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers[name.toLowerCase()] = value
    }
    const method = request.method.toUpperCase()
    const urlParams: Record<string, string> = {}
    let matched: Registered | null = null
    let captures: RegExpExecArray | null = null
    for (const route of this.routes) {
      if (route.method !== method) {
        continue
      }
      const match = route.pattern.exec(url.pathname)
      if (match && (matched === null || isMoreSpecific(route, matched))) {
        matched = route
        captures = match
      }
    }
    if (matched !== null && captures !== null) {
      const values = captures
      matched.names.forEach((name, index) => {
        urlParams[name] = decodeURIComponent(values[index + 1])
      })
    }
    const execute = matched?.execute ?? this.notFound
    if (execute === null) {
      return { status: 404, headers: {}, text: '', body: undefined }
    }

    const abort = new AbortController()
    const input: RouteInput = {
      method,
      path: url.pathname,
      header: (name) => headers[name.toLowerCase()],
      headers: () => new Headers(headers),
      urlParams,
      query: () => parseQuery(url.searchParams),
      body: () => {
        const { body } = request
        if (typeof body !== 'string') {
          return body
        }
        if ((headers['content-type'] ?? 'application/json').includes('json')) {
          try {
            return JSON.parse(body)
          } catch (error) {
            throw new ValidationError('body', [
              { message: `Malformed JSON body: ${(error as Error).message}` },
            ])
          }
        }
        return body
      },
      signal: () => abort.signal,
      raw: { request },
    }

    this.inFlight++
    let result: RouteResult | undefined
    try {
      result = this.serialisable(await execute(input))
      const text = await readBody(result)
      const responseHeaders: Record<string, string> = {}
      const contentType = DEFAULT_CONTENT_TYPES[result.kind]
      if (contentType && text !== '') {
        responseHeaders['content-type'] = contentType
      }
      Object.assign(responseHeaders, result.headers)
      if (result.cookies && result.cookies.length > 0) {
        responseHeaders['set-cookie'] = result.cookies.map(serializeCookie).join('\n')
      }
      let body: unknown
      if ((responseHeaders['content-type'] ?? '').includes('json') && text !== '') {
        body = JSON.parse(text)
      }
      return { status: result.status, headers: responseHeaders, text, body }
    } finally {
      await result?.release?.()
      this.inFlight--
      if (this.inFlight === 0) {
        this.idle?.()
      }
    }
  }

  /** Replaces a JSON result that cannot be serialised with an error response. */
  private serialisable(result: RouteResult): RouteResult {
    if (result.kind !== 'json') {
      return result
    }
    try {
      JSON.stringify(result.body)
      return result
    } catch (error) {
      const failure = this.errors?.unexpected(error) ?? problem(500)
      return { ...failure, release: result.release }
    }
  }

  async close(timeoutMs: number): Promise<void> {
    this.closed = true
    if (this.inFlight === 0) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      new Promise<void>((resolve) => {
        this.idle = resolve
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
    clearTimeout(timer)
  }
}

/**
 * The adapter definition for tests and for applications that are only driven
 * through `app.inject()`.
 */
export function defineInMemoryEnvironment(): AdapterDefinition<InMemoryEnvironment> {
  return { name: 'in-memory', create: (context) => new InMemoryAdapter(context.errors) }
}
