import type { Socket } from 'node:net'
import { Readable } from 'node:stream'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import {
  createMultipartCollector,
  HttpException,
  problem,
  serializeCookie,
  ValidationError,
} from '@navios/core'
import { fastify } from 'fastify'

import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
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
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Types an application that runs on Fastify:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: FastifyEnvironment
 *   }
 * }
 * ```
 */
export interface FastifyEnvironment extends HttpAdapterEnvironment {
  raw: { request: FastifyRequest; reply: FastifyReply }
  server: FastifyInstance
  listenOptions: FastifyListenOptions
}

export interface FastifyAdapterOptions extends FastifyServerOptions {
  /** Enables CORS with `@fastify/cors`. */
  cors?: FastifyCorsOptions
  /** Enables multipart bodies with `@fastify/multipart`. */
  multipart?: FastifyMultipartOptions | true
  /**
   * Called with the Fastify instance before any route is registered, to add
   * plugins, hooks or decorators.
   */
  configure?: (server: FastifyInstance) => void | Promise<void>
}

const RAW_BODY = Symbol('navios.rawBody')

/** How often `close()` looks for connections that have become idle. */
const IDLE_SWEEP_MS = 50

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  text: 'text/plain; charset=utf-8',
  blob: 'application/octet-stream',
  stream: 'application/octet-stream',
  sse: 'text/event-stream',
}

/**
 * One request as the pipeline sees it. Methods live on the prototype so that
 * a request allocates one object, not one closure per accessor.
 */
class FastifyRouteInput implements RouteInput {
  readonly raw: FastifyEnvironment['raw']
  private abort: AbortController | null = null

  constructor(
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
    private readonly adapter: FastifyAdapter,
    private readonly requestSchema: SchemaLike | undefined,
  ) {
    this.raw = { request, reply }
  }

  get method(): string {
    return this.request.method
  }

  get path(): string {
    const url = this.request.url
    const query = url.indexOf('?')
    return query < 0 ? url : url.slice(0, query)
  }

  get id(): string {
    return this.request.id
  }

  get urlParams(): Record<string, string> {
    return this.request.params as Record<string, string>
  }

  header(name: string): string | undefined {
    const value = this.request.headers[name.toLowerCase()]
    return Array.isArray(value) ? value.join(', ') : value
  }

  headers(): Headers {
    const headers = new Headers()
    for (const [name, value] of Object.entries(this.request.headers)) {
      if (value === undefined) {
        continue
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item)
        }
      } else {
        headers.set(name, value)
      }
    }
    return headers
  }

  headerRecord(): Record<string, string | undefined> {
    // `set-cookie` is the only header Node keeps as a list, and not one that
    // a request normally has.
    const { 'set-cookie': cookies, ...headers } = this.request.headers
    const record = headers as Record<string, string | undefined>
    if (cookies !== undefined) {
      record['set-cookie'] = cookies.join(', ')
    }
    return record
  }

  query(): unknown {
    return this.request.query
  }

  body(): unknown | Promise<unknown> {
    const { request } = this
    if (typeof (request as any).isMultipart === 'function' && (request as any).isMultipart()) {
      return this.readMultipart()
    }
    const body = request.body as any
    if (body !== null && typeof body === 'object' && RAW_BODY in body) {
      return this.adapter.parseJson(request, body[RAW_BODY] as string)
    }
    return body
  }

  private async readMultipart(): Promise<Record<string, unknown>> {
    const collector = createMultipartCollector(this.requestSchema)
    try {
      for await (const part of (this.request as any).parts()) {
        if (part.type === 'file') {
          collector.add(
            part.fieldname,
            new File([await part.toBuffer()], part.filename, { type: part.mimetype }),
          )
        } else {
          if (part.fieldnameTruncated || part.valueTruncated) {
            // `@fastify/multipart` cuts a field at `limits.fieldSize` (or its
            // name at `limits.fieldNameSize`) and carries on. Half a value
            // must not reach the handler.
            throw new HttpException(413, 'request field too large')
          }
          collector.add(part.fieldname, part.value as string)
        }
      }
    } catch (error) {
      throw toClientError(error)
    }
    return collector.result()
  }

  responded(): boolean {
    return this.reply.sent
  }

  signal(): AbortSignal {
    if (this.abort === null) {
      const abort = new AbortController()
      this.abort = abort
      // The response tells whether the client is there. The request emits
      // 'close' as soon as its body has been consumed.
      const { raw } = this.reply
      const abortIfGone = () => {
        if (!raw.writableFinished) {
          abort.abort()
        }
      }
      if (raw.destroyed) {
        abortIfGone()
      } else {
        raw.once('close', abortIfGone)
      }
    }
    return this.abort.signal
  }
}

/**
 * `@fastify/multipart` rejects a body over one of its `limits` (413), and
 * other bodies a client got wrong, with a Fastify error that carries a 4xx
 * status. The body is read inside the pipeline, where Fastify's error handler
 * does not see it, so the error is turned into the same problem response here.
 */
function toClientError(error: unknown): unknown {
  const { code, statusCode } = (error ?? {}) as { code?: unknown; statusCode?: unknown }
  if (
    typeof code === 'string' &&
    code.startsWith('FST_') &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    return new HttpException(statusCode, String((error as Error).message ?? ''), error)
  }
  return error
}

function toNodeBody(result: RouteResult): unknown | Promise<unknown> {
  const { body } = result
  if (body === undefined || body === null) {
    return undefined
  }
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Readable) {
    return body
  }
  if (body instanceof Blob) {
    return body.arrayBuffer().then((buffer) => Buffer.from(buffer))
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (typeof (body as any).getReader === 'function') {
    return Readable.fromWeb(body as any)
  }
  if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
    return Readable.from(body as AsyncIterable<unknown>)
  }
  return body
}

function write(reply: FastifyReply, result: RouteResult): FastifyReply | Promise<FastifyReply> {
  const { raw } = reply
  if (raw.destroyed) {
    // The client is gone: there is nothing to write to, and 'close' has
    // already fired, so release now.
    void result.release?.()
    return reply
  }
  if (result.release !== undefined) {
    // 'finish' covers a completed response, 'close' a connection that went
    // away first. Whichever comes first releases; the other is ignored.
    let release: RouteResult['release'] | null = result.release
    const done = () => {
      const pending = release
      release = null
      if (pending) {
        void pending()
      }
    }
    raw.once('finish', done)
    raw.once('close', done)
  }
  if (reply.sent) {
    // The handler wrote through ctx.raw.reply and took the response over.
    return reply
  }
  reply.code(result.status)
  if (result.headers !== undefined) {
    reply.headers(result.headers)
  }
  if (result.cookies !== undefined && result.cookies.length > 0) {
    reply.header('set-cookie', result.cookies.map(serializeCookie))
  }
  switch (result.kind) {
    case 'json':
      if (result.headers?.['content-type'] === undefined) {
        reply.type('application/json; charset=utf-8')
      }
      return reply.send(JSON.stringify(result.body))
    case 'empty':
      return reply.send()
    default: {
      if (result.headers?.['content-type'] === undefined) {
        const type = DEFAULT_CONTENT_TYPES[result.kind]
        if (type !== undefined) {
          reply.type(type)
        }
      }
      const body = toNodeBody(result)
      return body instanceof Promise ? body.then((value) => reply.send(value)) : reply.send(body)
    }
  }
}

export class FastifyAdapter implements HttpAdapter<FastifyEnvironment> {
  private parseDefaultJson!: (request: FastifyRequest, body: string, done: any) => void
  private closing = false
  private readonly sockets = new Set<Socket>()

  private constructor(
    readonly server: FastifyInstance,
    private readonly context: AdapterContext,
  ) {}

  static async create(
    options: FastifyAdapterOptions,
    context: AdapterContext,
  ): Promise<FastifyAdapter> {
    const { cors: corsOptions, multipart: multipartOptions, configure, ...serverOptions } = options
    const server = fastify(serverOptions)
    const adapter = new FastifyAdapter(server, context)
    adapter.install()
    if (corsOptions) {
      await server.register(cors, corsOptions)
    }
    if (multipartOptions) {
      await server.register(multipart, multipartOptions === true ? {} : multipartOptions)
    }
    await configure?.(server)
    return adapter
  }

  private install(): void {
    const { server } = this
    server.server.on('connection', (socket: Socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })
    this.parseDefaultJson = server.getDefaultJsonParser('error', 'error') as any

    // JSON bodies are collected as text and parsed when the pipeline asks for
    // the body, which is after guards have passed. Fastify still enforces
    // `bodyLimit` while collecting.
    server.removeContentTypeParser('application/json')
    server.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, { [RAW_BODY]: body })
      },
    )

    server.setErrorHandler((error: any, request, reply) => {
      const status =
        typeof error?.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500
      if (status >= 500) {
        this.context.logger.error(`Error on ${request.method} ${request.url}`, error)
      }
      const result = problem(status, status >= 500 ? undefined : String(error?.message ?? ''))
      return write(reply, result)
    })
  }

  /** @internal */
  parseJson(request: FastifyRequest, body: string): Promise<unknown> | unknown {
    if (body === '') {
      return undefined
    }
    let parsed: unknown
    let failure: any = null
    this.parseDefaultJson(request, body, (error: any, value: unknown) => {
      failure = error
      parsed = value
    })
    if (failure) {
      throw new ValidationError('body', [
        { message: `Malformed JSON body: ${String(failure.message ?? failure)}` },
      ])
    }
    return parsed
  }

  private notFound: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => FastifyReply | Promise<FastifyReply> = (_request, reply) => {
    reply.callNotFound()
    return reply
  }

  private handlerFor(execute: RouteExecutor, requestSchema: SchemaLike | undefined) {
    return (request: FastifyRequest, reply: FastifyReply) => {
      const result = execute(new FastifyRouteInput(request, reply, this, requestSchema))
      return result instanceof Promise
        ? result.then((value) => this.respond(reply, value))
        : this.respond(reply, result)
    }
  }

  private respond(reply: FastifyReply, result: RouteResult): FastifyReply | Promise<FastifyReply> {
    if (this.closing && !reply.sent) {
      // Tell the client not to reuse the connection it is being answered on.
      reply.header('connection', 'close')
    }
    return write(reply, result)
  }

  register(route: CompiledRoute): void {
    const { info } = route
    const handler = this.handlerFor(
      route.execute,
      info.endpoint.body === 'multipart' ? info.endpoint.requestSchema : undefined,
    )
    this.server.route({
      method: info.method as any,
      url: info.path.replace(/\$([A-Za-z0-9_]+)/g, ':$1'),
      // find-my-way matches `/users/` to `/users/:id` with an empty `id`. A url
      // param is never empty, so such a request has matched no route.
      handler: info.path.includes('$')
        ? (request, reply) =>
            hasEmptyParam(request.params as Record<string, string>)
              ? this.notFound(request, reply)
              : handler(request, reply)
        : handler,
    })
  }

  setNotFound(execute: RouteExecutor): void {
    this.notFound = this.handlerFor(execute, undefined)
    this.server.setNotFoundHandler(this.notFound)
  }

  async ready(): Promise<void> {
    await this.server.ready()
  }

  listen(options: FastifyListenOptions): Promise<string> {
    return this.server.listen(options)
  }

  async inject(request: TestRequest): Promise<TestResponse> {
    const { body } = request
    const response = await this.server.inject({
      method: request.method as any,
      url: request.url,
      headers: request.headers,
      payload: body as any,
    })
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        headers[name] = Array.isArray(value) ? value.join('\n') : String(value)
      }
    }
    const text = response.body
    let parsed: unknown
    if ((headers['content-type'] ?? '').includes('json') && text !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
    }
    return { status: response.statusCode, headers, text, body: parsed }
  }

  async close(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    this.closing = true
    const closing = this.server.close()
    // Closing the server drops the keep-alive connections that are idle at
    // that moment. One whose response was already under way becomes idle
    // later, and one that a client opened ahead of time and has not used does
    // not count as idle. Both would hold the server open.
    const sweep = setInterval(() => {
      this.server.server.closeIdleConnections?.()
      for (const socket of this.sockets) {
        if (socket.bytesRead === 0) {
          socket.destroy()
        }
      }
    }, IDLE_SWEEP_MS)
    try {
      await Promise.race([
        closing,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true
            resolve()
          }, timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
      clearInterval(sweep)
    }
    if (timedOut) {
      // In-flight requests outlived the timeout: drop their connections so
      // that the server can finish closing.
      this.server.server.closeAllConnections?.()
      await closing
    }
  }
}

/**
 * Runs a Navios application on Fastify.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment({ cors: { origin: true }, multipart: true }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineFastifyEnvironment(
  options: FastifyAdapterOptions = {},
): AdapterDefinition<FastifyEnvironment> {
  return {
    name: 'fastify',
    create: (context) => FastifyAdapter.create(options, context),
  }
}

function hasEmptyParam(params: Record<string, string>): boolean {
  for (const name in params) {
    if (params[name] === '') {
      return true
    }
  }
  return false
}
