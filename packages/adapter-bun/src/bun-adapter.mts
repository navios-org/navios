import { createMultipartCollector, serializeCookie, ValidationError } from '@navios/core'

import type {
  AdapterContext,
  AdapterDefinition,
  CompiledRoute,
  HttpAdapter,
  HttpAdapterEnvironment,
  RouteExecutor,
  RouteInput,
  RouteResult,
  SchemaLike,
  TestRequest,
  TestResponse,
} from '@navios/core'
import type { BunRequest, Serve, Server } from 'bun'

import { applyCorsToResponse, calculatePreflightHeaders, isPreflight } from './cors.mjs'

import type { BunCorsOptions } from './cors.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type BunServer = Server<undefined>

/**
 * Types an application that runs on Bun:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: BunEnvironment
 *   }
 * }
 * ```
 */
export interface BunEnvironment extends HttpAdapterEnvironment {
  raw: { request: Request; server: BunServer | null }
  server: BunServer
  listenOptions: BunListenOptions
}

export interface BunListenOptions {
  port?: number
  hostname?: string
}

export interface BunAdapterOptions {
  /** Enables CORS. */
  cors?: BunCorsOptions
  /** Extra options for `Bun.serve`. `routes`, `fetch`, `port` and `hostname` are set by the adapter. */
  serve?: Omit<Serve.Options<undefined, string>, 'routes' | 'fetch' | 'port' | 'hostname'>
}

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

interface Matcher {
  method: string
  pattern: RegExp
  names: string[]
  handle: (request: Request, params: Record<string, string>) => Response | Promise<Response>
}

function pathOf(url: string): string {
  // `url` is absolute: scheme://host/path?query
  const start = url.indexOf('/', url.indexOf('//') + 2)
  if (start < 0) {
    return '/'
  }
  const query = url.indexOf('?', start)
  return query < 0 ? url.slice(start) : url.slice(start, query)
}

function parseQuery(url: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const index = url.indexOf('?')
  if (index < 0) {
    return result
  }
  for (const [key, value] of new URLSearchParams(url.slice(index + 1))) {
    const existing = result[key]
    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }
  return result
}

class BunRouteInput implements RouteInput {
  readonly raw: BunEnvironment['raw']

  constructor(
    private readonly request: Request,
    readonly urlParams: Record<string, string>,
    server: BunServer | null,
    private readonly multipartSchema: SchemaLike | undefined,
    private readonly isMultipart: boolean,
  ) {
    this.raw = { request, server }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    return pathOf(this.request.url)
  }

  header(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined
  }

  headers(): Headers {
    return this.request.headers
  }

  query(): unknown {
    return parseQuery(this.request.url)
  }

  async body(): Promise<unknown> {
    const { request } = this
    const contentType = request.headers.get('content-type') ?? ''
    if (this.isMultipart || contentType.includes('multipart/form-data')) {
      const collector = createMultipartCollector(this.multipartSchema)
      const form = await request.formData()
      for (const [field, value] of form as unknown as Iterable<[string, string | File]>) {
        collector.add(field, value)
      }
      return collector.result()
    }
    if (contentType === '' || contentType.includes('json')) {
      const text = await request.text()
      if (text === '') {
        return undefined
      }
      try {
        return JSON.parse(text)
      } catch (error) {
        throw new ValidationError('body', [
          { message: `Malformed JSON body: ${(error as Error).message}` },
        ])
      }
    }
    return request.text()
  }

  signal(): AbortSignal {
    return this.request.signal
  }
}

function streamFrom(iterable: AsyncIterable<unknown>, done: () => void): ReadableStream {
  const iterator = iterable[Symbol.asyncIterator]()
  const encoder = new TextEncoder()
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) {
          controller.close()
          done()
          return
        }
        controller.enqueue(
          typeof next.value === 'string' ? encoder.encode(next.value) : (next.value as Uint8Array),
        )
      } catch (error) {
        done()
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
      done()
    },
  })
}

function toResponse(result: RouteResult, request: Request): Response {
  const headers = new Headers(result.headers)
  if (result.cookies !== undefined) {
    for (const cookie of result.cookies) {
      headers.append('set-cookie', serializeCookie(cookie))
    }
  }

  // Release when the response is done: right away for a body that is already
  // in memory, at the end of a stream otherwise, or when the client goes away.
  let release = result.release ?? null
  const done = () => {
    const pending = release
    release = null
    if (pending) {
      void pending()
    }
  }
  if (release !== null) {
    request.signal.addEventListener('abort', done, { once: true })
  }

  let body: any = null
  if (result.kind !== 'empty' && result.body !== undefined && result.body !== null) {
    if (!headers.has('content-type')) {
      const type = DEFAULT_CONTENT_TYPES[result.kind]
      if (type !== undefined) {
        headers.set('content-type', type)
      }
    }
    const value = result.body as any
    if (result.kind === 'json') {
      body = JSON.stringify(value)
    } else if (typeof value === 'string' || value instanceof Blob || value instanceof ArrayBuffer) {
      body = value
    } else if (ArrayBuffer.isView(value)) {
      body = value
    } else if (
      typeof value[Symbol.asyncIterator] === 'function' ||
      typeof value.getReader === 'function'
    ) {
      const response = new Response(streamFrom(value as AsyncIterable<unknown>, done), {
        status: result.status,
        headers,
      })
      return response
    } else {
      body = value
    }
  }
  const response = new Response(body, { status: result.status, headers })
  if (release !== null) {
    queueMicrotask(done)
  }
  return response
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

export class BunAdapter implements HttpAdapter<BunEnvironment> {
  private bunServer: BunServer | null = null
  private readonly routes: Record<
    string,
    Record<string, (request: BunRequest) => Response | Promise<Response>>
  > = {}
  private readonly matchers: Matcher[] = []
  private notFound: RouteExecutor | null = null
  private inFlight = 0
  private idle: (() => void) | null = null

  private readonly options: BunAdapterOptions

  constructor(
    options: BunAdapterOptions,
    private readonly context: AdapterContext,
  ) {
    // Like @fastify/cors: enabling CORS without an origin allows any origin.
    this.options = options.cors ? { ...options, cors: { origin: '*', ...options.cors } } : options
  }

  get server(): BunServer {
    if (this.bunServer === null) {
      throw new Error('[Navios] The Bun server is created by listen(); call listen() first.')
    }
    return this.bunServer
  }

  private run(
    execute: RouteExecutor,
    request: Request,
    params: Record<string, string>,
    multipartSchema: SchemaLike | undefined,
    isMultipart: boolean,
  ): Response | Promise<Response> {
    const input = new BunRouteInput(request, params, this.bunServer, multipartSchema, isMultipart)
    this.inFlight++
    const finish = (response: Response): Response | Promise<Response> => {
      this.inFlight--
      if (this.inFlight === 0) {
        this.idle?.()
      }
      const cors = this.options.cors
      return cors ? applyCorsToResponse(response, request.headers.get('origin'), cors) : response
    }
    let result: RouteResult | Promise<RouteResult>
    try {
      result = execute(input)
    } catch (error) {
      // The executor maps every error itself; this is a last line of defence.
      this.context.logger.error('Unexpected adapter error', error)
      return finish(new Response(null, { status: 500 }))
    }
    return result instanceof Promise
      ? result.then((value) => finish(toResponse(value, request)))
      : finish(toResponse(result, request))
  }

  register(route: CompiledRoute): void {
    const { info, execute } = route
    const isMultipart = info.endpoint.body === 'multipart'
    const schema = isMultipart ? info.endpoint.requestSchema : undefined
    const path = info.path.replace(/\$([A-Za-z0-9_]+)/g, ':$1')
    ;(this.routes[path] ??= {})[info.method] = (request) =>
      this.run(execute, request, request.params as Record<string, string>, schema, isMultipart)

    const { pattern, names } = compilePath(info.path)
    this.matchers.push({
      method: info.method,
      pattern,
      names,
      handle: (request, params) => this.run(execute, request, params, schema, isMultipart),
    })
  }

  setNotFound(execute: RouteExecutor): void {
    this.notFound = execute
  }

  async ready(): Promise<void> {}

  /** Handles a request that matched no route: CORS preflight, then 404. */
  private async fallback(request: Request): Promise<Response> {
    const cors = this.options.cors
    const origin = request.headers.get('origin')
    const requested = request.headers.get('access-control-request-method')
    if (cors && isPreflight(request.method, origin, requested)) {
      const headers = await calculatePreflightHeaders(
        origin ?? undefined,
        requested,
        request.headers.get('access-control-request-headers'),
        cors,
      )
      if (headers) {
        return new Response(null, { status: 204, headers: headers as HeadersInit })
      }
    }
    if (this.notFound === null) {
      return new Response(null, { status: 404 })
    }
    return this.run(this.notFound, request, {}, undefined, false)
  }

  async listen(options: BunListenOptions = {}): Promise<string> {
    this.bunServer = Bun.serve({
      ...(this.options.serve as object),
      routes: this.routes,
      port: options.port ?? 3000,
      hostname: options.hostname ?? 'localhost',
      fetch: (request: Request) => this.fallback(request),
    } as any) as BunServer
    return this.bunServer.url.toString().replace(/\/$/, '')
  }

  async inject(request: TestRequest): Promise<TestResponse> {
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
    let response: Response | undefined
    for (const matcher of this.matchers) {
      if (matcher.method !== method) {
        continue
      }
      const match = matcher.pattern.exec(path)
      if (match) {
        const params: Record<string, string> = {}
        matcher.names.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1])
        })
        response = await matcher.handle(native, params)
        break
      }
    }
    response ??= await this.fallback(native)

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

  async close(timeoutMs: number): Promise<void> {
    const server = this.bunServer
    let timer: ReturnType<typeof setTimeout> | undefined
    const drained =
      this.inFlight === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            this.idle = resolve
          })
    await Promise.race([
      Promise.all([drained, server ? server.stop(false) : Promise.resolve()]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
    clearTimeout(timer)
    if (server) {
      await server.stop(true)
    }
    this.bunServer = null
  }
}

/**
 * Runs a Navios application on `Bun.serve`.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment({ cors: { origin: true } }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineBunEnvironment(
  options: BunAdapterOptions = {},
): AdapterDefinition<BunEnvironment> {
  return { name: 'bun', create: (context) => new BunAdapter(options, context) }
}
