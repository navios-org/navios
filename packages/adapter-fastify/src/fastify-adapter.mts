import type { Socket } from 'node:net'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { problem, ValidationError } from '@navios/server'
import { fastify } from 'fastify'

import type {
  AdapterContext,
  CompiledRoute,
  HttpAdapter,
  RouteExecutor,
  RouteResult,
  SchemaLike,
  TestRequest,
  TestResponse,
} from '@navios/server'
import type { FastifyInstance, FastifyListenOptions, FastifyReply, FastifyRequest } from 'fastify'

import { FastifyRouteInput, RAW_BODY } from './request-input.mjs'
import { write } from './send-result.mjs'

import type { FastifyAdapterOptions, FastifyEnvironment } from './environment.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How often `close()` looks for connections that have become idle. */
const IDLE_SWEEP_MS = 50

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

function hasEmptyParam(params: Record<string, string>): boolean {
  for (const name in params) {
    if (params[name] === '') {
      return true
    }
  }
  return false
}
