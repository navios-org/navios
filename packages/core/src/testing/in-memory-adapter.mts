import { serializeCookie } from '../adapter/cookies.mjs'
import { ValidationError } from '../routing/validation.mjs'

import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
  TestRequest,
  TestResponse,
} from '../adapter/http-adapter.mjs'
import type { CompiledRoute, RouteExecutor, RouteInput, RouteResult } from '../routing/types.mjs'

export interface InMemoryEnvironment extends HttpAdapterEnvironment {
  raw: { request: TestRequest }
  server: null
  listenOptions: never
}

interface Registered {
  method: string
  pattern: RegExp
  names: string[]
  execute: RouteExecutor
}

function compilePath(path: string): { pattern: RegExp; names: string[] } {
  const names: string[] = []
  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith('$')) {
        names.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${source || '/'}/?$`), names }
}

async function readBody(result: RouteResult): Promise<string> {
  const { body, kind } = result
  if (kind === 'empty' || body === undefined || body === null) {
    return ''
  }
  if (kind === 'json') {
    return JSON.stringify(body)
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

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
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

  register(route: CompiledRoute): void {
    const { pattern, names } = compilePath(route.info.path)
    this.routes.push({ method: route.info.method, pattern, names, execute: route.execute })
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
    let urlParams: Record<string, string> = {}
    let execute: RouteExecutor | null = null
    for (const route of this.routes) {
      if (route.method !== method) {
        continue
      }
      const match = route.pattern.exec(url.pathname)
      if (match) {
        urlParams = {}
        route.names.forEach((name, index) => {
          urlParams[name] = decodeURIComponent(match[index + 1])
        })
        execute = route.execute
        break
      }
    }
    execute ??= this.notFound
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
      query: () => Object.fromEntries(url.searchParams),
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
      result = await execute(input)
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
  return { name: 'in-memory', create: () => new InMemoryAdapter() }
}
