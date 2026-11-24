import {
  createMultipartCollector,
  HttpException,
  problem,
  serializeCookie,
  ValidationError,
} from '@navios/core'

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
  /**
   * Extra options for `Bun.serve`. `routes`, `fetch`, `port` and `hostname` are set by the adapter.
   *
   * `maxRequestBodySize` (128 MiB when not set, as in Bun) is enforced by the
   * adapter, which answers a larger body with a 413 problem response. Bun
   * would answer with an empty 413 before the adapter saw the request.
   */
  serve?: Omit<Serve.Options<undefined, string>, 'routes' | 'fetch' | 'port' | 'hostname'>
}

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

/** The default of `Bun.serve`. */
const DEFAULT_BODY_LIMIT = 128 * 1024 * 1024

const BODY_TOO_LARGE = 'Request body is too large'

/** Whether a request declares a body that is larger than `limit`. */
function declaresTooLarge(request: Request, limit: number): boolean {
  const declared = request.headers.get('content-length')
  return declared !== null && Number(declared) > limit
}

/**
 * Reads a body of unknown length, giving up as soon as it is over `limit`.
 * The result has the `text()` and `formData()` of the request.
 */
async function readLimited(request: Request, limit: number): Promise<Request | Response> {
  const { body } = request
  if (body === null) {
    return request
  }
  const reader = body.getReader()
  const chunks: BlobPart[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    size += value.byteLength
    if (size > limit) {
      void reader.cancel().catch(() => {})
      throw new HttpException(413, BODY_TOO_LARGE)
    }
    chunks.push(value as BlobPart)
  }
  const contentType = request.headers.get('content-type')
  return new Response(new Blob(chunks), {
    headers: contentType === null ? undefined : { 'content-type': contentType },
  })
}

interface Matcher {
  method: string
  pattern: RegExp
  names: string[]
  /** For each segment of the path, whether it is a url param. */
  params: boolean[]
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
    private readonly bodyLimit: number,
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
    const contentType = this.request.headers.get('content-type') ?? ''
    // A declared length was checked before the pipeline ran, and the body
    // cannot be longer than it. Without one (chunked transfer encoding, or
    // `inject()`) the bytes are counted while they are read.
    const request = this.request.headers.has('content-length')
      ? this.request
      : await readLimited(this.request, this.bodyLimit)
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

  let body: any = null
  // `null` is a JSON value; for any other kind it means that there is no body.
  if (
    result.kind !== 'empty' &&
    result.body !== undefined &&
    (result.body !== null || result.kind === 'json')
  ) {
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
      if (request.signal.aborted) {
        done()
      } else if (release !== null) {
        request.signal.addEventListener('abort', done, { once: true })
      }
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

function compilePath(path: string): Pick<Matcher, 'pattern' | 'names' | 'params'> {
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
  private readonly bodyLimit: number

  constructor(
    options: BunAdapterOptions,
    private readonly context: AdapterContext,
  ) {
    if (options.cors && options.cors.credentials && (options.cors.origin ?? '*') === '*') {
      throw new Error(
        '[Navios] CORS with credentials needs an explicit origin: browsers reject ' +
          'Access-Control-Allow-Origin: * on credentialed requests. Set cors.origin to the allowed origin(s).',
      )
    }
    // Like @fastify/cors: enabling CORS without an origin allows any origin.
    this.options = options.cors ? { ...options, cors: { origin: '*', ...options.cors } } : options
    this.bodyLimit = options.serve?.maxRequestBodySize ?? DEFAULT_BODY_LIMIT
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
    const cors = this.options.cors
    const withCors = (response: Response): Response | Promise<Response> =>
      cors ? applyCorsToResponse(response, request.headers.get('origin'), cors) : response
    if (declaresTooLarge(request, this.bodyLimit)) {
      // Answered here, as Bun and Fastify do: before guards, and whether or
      // not the route reads a body. Bun discards the body without buffering.
      return withCors(toResponse(problem(413, BODY_TOO_LARGE), request))
    }
    const input = new BunRouteInput(
      request,
      params,
      this.bunServer,
      multipartSchema,
      isMultipart,
      this.bodyLimit,
    )
    this.inFlight++
    const finish = (response: Response): Response | Promise<Response> => {
      this.inFlight--
      if (this.inFlight === 0) {
        this.idle?.()
      }
      return withCors(response)
    }
    // The executor maps the errors of a request itself. What is left are
    // results that cannot be written and defects of the pipeline's
    // extensions; neither may reach Bun, which would answer with its own
    // error page.
    const respond = (result: RouteResult): Response | Promise<Response> => {
      let response: Response
      try {
        response = toResponse(result, request)
      } catch (error) {
        void result.release?.()
        response = this.failure(error, request)
      }
      return finish(response)
    }
    const fail = (error: unknown): Response | Promise<Response> =>
      finish(this.failure(error, request))

    let result: RouteResult | Promise<RouteResult>
    try {
      result = execute(input)
    } catch (error) {
      return fail(error)
    }
    return result instanceof Promise ? result.then(respond, fail) : respond(result)
  }

  private failure(error: unknown, request: Request): Response {
    try {
      return toResponse(this.context.errors.unexpected(error), request)
    } catch (responderError) {
      this.context.logger.error('The error response could not be written', responderError)
      return new Response(null, { status: 500 })
    }
  }

  register(route: CompiledRoute): void {
    const { info, execute } = route
    const isMultipart = info.endpoint.body === 'multipart'
    const schema = isMultipart ? info.endpoint.requestSchema : undefined
    const path = info.path.replace(/\$([A-Za-z0-9_]+)/g, ':$1')
    ;(this.routes[path] ??= {})[info.method] = (request) =>
      this.run(execute, request, request.params as Record<string, string>, schema, isMultipart)

    this.matchers.push({
      method: info.method,
      ...compilePath(info.path),
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
      // The adapter enforces the limit itself, to answer with a problem
      // response. Bun's own check must not come first.
      maxRequestBodySize: Number.MAX_SAFE_INTEGER,
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
    let matched: Matcher | null = null
    let captures: RegExpExecArray | null = null
    for (const matcher of this.matchers) {
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
        params[name] = decodeURIComponent(values[index + 1])
      })
      response = await matched.handle(native, params)
    } else {
      response = await this.fallback(native)
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
