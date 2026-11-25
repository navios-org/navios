import type { Socket } from 'node:net'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { HttpException, problem } from '@navios/server'
import {
  canonicalPath,
  describesSuccess,
  encodeResult,
  toTestMessage,
  toTestResponse,
} from '@navios/server/adapter'
import { fastify } from 'fastify'

import type { RouteResult } from '@navios/server'
import type {
  AdapterContext,
  CompiledRoute,
  ErrorSite,
  HttpAdapter,
  RouteExecutor,
  RoutePath,
  RouteResponse,
  TestRequest,
  TestResponse,
} from '@navios/server/adapter'
import type { FastifyInstance, FastifyListenOptions, FastifyReply, FastifyRequest } from 'fastify'

import { answerClientError } from './client-error.mjs'
import { corsHook } from './cors-hook.mjs'
import { FastifyRouteInput, RAW_BODY, RequestWithoutAddress } from './request-input.mjs'
import { write } from './send-response.mjs'

import type { CorsHook } from './cors-hook.mjs'
import type { FastifyAdapterOptions, FastifyEnvironment } from './environment.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How often `close()` looks for connections that have become idle. */
const IDLE_SWEEP_MS = 50

/** How long `close()` waits once it has dropped every connection. */
const FORCED_CLOSE_MS = 1000

export class FastifyAdapter implements HttpAdapter<FastifyEnvironment> {
  /** Routes that cannot be served without a parser for multipart bodies. */
  private readonly multipartRoutes: string[] = []
  private multipartLimit = 0
  private closing = false
  private cors: CorsHook | null = null
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
    assertMultipartOptions(multipartOptions)
    let adapter: FastifyAdapter | undefined
    const server = fastify({
      frameworkErrors: (error, request, reply) => adapter!.refuse(error, request, reply),
      clientErrorHandler: answerClientError,
      ...(serverOptions as object),
    })
    adapter = new FastifyAdapter(server, context)
    adapter.install(multipartOptions)
    if (corsOptions) {
      await server.register(cors, corsOptions)
      adapter.cors = corsHook(server, corsOptions)
    }
    if (multipartOptions) {
      await server.register(multipart, multipartOptions === true ? {} : multipartOptions)
    }
    await configure?.(server)
    // Plugins that `configure` has registered without awaiting them.
    await server.after()
    adapter.collectBodies()
    return adapter
  }

  private install(multipartOptions: FastifyAdapterOptions['multipart']): void {
    const { server } = this
    this.multipartLimit = multipartLimit(server.initialConfig.bodyLimit!, multipartOptions)
    server.decorateRequest(RAW_BODY, null)
    // Fastify does not tell whether there is a parser for any type. One that
    // the application adds replaces this one.
    server.addContentTypeParser('*', { parseAs: 'buffer' }, collectBody)
    const keep = (socket: Socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    }
    server.server.on('connection', keep)
    // What a TLS connection has read itself includes the handshake.
    server.server.on('secureConnection', keep)
    server.setErrorHandler((error, request, reply) => this.fail(error, request, reply))
  }

  /**
   * Has Fastify collect a body of any type as bytes, up to `bodyLimit`. The
   * server decodes it when the pipeline asks for it, after guards. A parser of
   * the application keeps its content type.
   */
  private collectBodies(): void {
    const { server } = this
    // Fastify looks the parser for any type up more slowly than one for a type
    // it knows, so the usual types are named.
    for (const type of ['application/json', 'text/plain']) {
      try {
        server.addContentTypeParser(type, { parseAs: 'buffer' }, collectBody)
      } catch (error) {
        if ((error as { code?: unknown }).code !== 'FST_ERR_CTP_ALREADY_PRESENT') {
          throw error
        }
      }
    }
  }

  /** Answers an error of the router, such as a bad url. No hook sees such a request. */
  private refuse(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const fail = () => void this.fail(error, request, reply)
    if (this.cors === null) {
      fail()
      return
    }
    try {
      // What the CORS check itself fails with does not change the answer.
      this.cors(request, reply, fail)
    } catch {
      fail()
    }
  }

  /** Answers an error that Fastify, a plugin or a hook has raised. */
  private async fail(
    error: any,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    if (reply.raw.destroyed) {
      // For example the end of a stream whose connection is gone.
      return reply
    }
    // What the response was going to be, if a hook failed while it was sent.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined && describesSuccess(name, value)) {
        reply.removeHeader(name)
      }
    }
    const at = { method: request.method, path: canonicalPath(request.url) }
    let response: RouteResponse
    try {
      response = encodeResult(await this.toResult(error, at))
    } catch (defect) {
      response = this.context.errors.unexpected(defect, at)
    }
    return write(reply, response)
  }

  private toResult(error: any, at: ErrorSite): RouteResult | Promise<RouteResult> {
    const { errors } = this.context
    const status = error instanceof HttpException ? undefined : error?.statusCode
    if (status >= 400 && status < 500) {
      return problem(status, String(error.message ?? ''))
    }
    if (status > 500 && status < 600) {
      // The status is meant for the client, what went wrong is not.
      errors.report(error, at)
      return problem(status)
    }
    return errors.toResult(error, null, null, at)
  }

  private handlerFor(execute: RouteExecutor) {
    return (request: FastifyRequest, reply: FastifyReply) => {
      const response = execute(new FastifyRouteInput(request, reply, this.multipartLimit))
      return response instanceof Promise
        ? response.then((value) => this.respond(reply, value))
        : this.respond(reply, response)
    }
  }

  private respond(
    reply: FastifyReply,
    response: RouteResponse,
  ): FastifyReply | Promise<FastifyReply> {
    if (this.closing && !reply.sent) {
      // Tell the client not to reuse the connection it is being answered on.
      reply.header('connection', 'close')
    }
    return write(reply, response)
  }

  register({ info, path, execute }: CompiledRoute): void {
    if (info.endpoint.body === 'multipart') {
      this.multipartRoutes.push(`${info.method} ${info.path}`)
    }
    this.server.route({
      method: info.method as any,
      url: toFastifyPath(path),
      handler: this.handlerFor(execute),
    })
  }

  setNotFound(execute: RouteExecutor): void {
    this.server.setNotFoundHandler(this.handlerFor(execute))
  }

  async ready(): Promise<void> {
    await this.server.ready()
    const [route] = this.multipartRoutes
    if (route !== undefined && !this.server.hasContentTypeParser('multipart/form-data')) {
      throw new Error(
        `[Navios] ${route} has a multipart body, which needs the adapter option: ` +
          `defineFastifyEnvironment({ multipart: true }).`,
      )
    }
  }

  listen(options: FastifyListenOptions): Promise<string> {
    return this.server.listen(options)
  }

  async inject(request: TestRequest): Promise<TestResponse> {
    const { method, headers, bytes } = await toTestMessage(request)
    const response = await this.server.inject({
      method: method as any,
      url: request.url,
      headers: { ...headers },
      payload: bytes === undefined ? undefined : Buffer.from(bytes),
      ...(request.remoteAddress === undefined
        ? { Request: RequestWithoutAddress }
        : { remoteAddress: request.remoteAddress }),
    })
    const text = method === 'HEAD' ? '' : response.body
    return toTestResponse(response.statusCode, response.headers, text)
  }

  async close(timeoutMs: number): Promise<void> {
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
      if (!(await isDoneWithin(closing, timeoutMs))) {
        // What has outlived the timeout: requests in flight, and connections
        // that Fastify no longer knows, such as those of WebSockets.
        // A request learns of it when its connection has been closed, and has
        // to before the server releases what it holds.
        const closed = Array.from(this.sockets, (socket) => {
          const pending = new Promise<void>((resolve) => socket.once('close', () => resolve()))
          socket.destroy()
          return pending
        })
        await isDoneWithin(Promise.all([closing, ...closed]), FORCED_CLOSE_MS)
      }
    } finally {
      clearInterval(sweep)
    }
  }
}

/** Waits for `work`, for at most `ms`. */
async function isDoneWithin(work: PromiseLike<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(resolve, ms, false)
  })
  try {
    return await Promise.race([work.then(() => true), timeout])
  } finally {
    clearTimeout(timer)
  }
}

function collectBody(request: FastifyRequest, body: Buffer, done: any): void {
  ;(request as any)[RAW_BODY] = body
  done(null, body)
}

function toFastifyPath({ segments }: RoutePath): string {
  return segments
    .map((segment) =>
      'param' in segment ? `/:${segment.param}` : `/${segment.literal.replaceAll(':', '::')}`,
    )
    .join('')
}

function assertMultipartOptions(options: object | true | undefined): void {
  if (typeof options !== 'object') {
    return
  }
  for (const name of ['attachFieldsToBody', 'onFile', 'sharedSchemaId']) {
    if (name in options) {
      throw new Error(
        `[Navios] The multipart option ${name} cannot be used: the adapter collects the parts of a ` +
          `body itself.`,
      )
    }
  }
}

/** How many bytes all parts of a body may have, which are in memory together. */
function multipartLimit(bodyLimit: number, options: FastifyAdapterOptions['multipart']): number {
  const { fileSize, files, fieldSize, fields } =
    (typeof options === 'object' && options.limits) || {}
  return bodyLimit + (fileSize ?? 0) * (files ?? 1) + (fieldSize ?? 0) * (fields ?? 1)
}
