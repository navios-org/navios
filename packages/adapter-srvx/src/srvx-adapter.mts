import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'node:net'

import {
  bodyTooLarge,
  canonicalPath,
  encodeResult,
  malformedPath,
  ManagedBody,
  RouteTable,
  settledWithin,
} from '@navios/server/adapter'
import { Cors, injectRequest, limitBody, toWebHeaders } from '@navios/server/web'
import { serve } from 'srvx'

import type {
  AdapterContext,
  CompiledRoute,
  HttpAdapter,
  RouteExecutor,
  RouteMatch,
  RouteResponse,
  TestRequest,
  TestResponse,
} from '@navios/server/adapter'

import { SrvxRouteInput } from './request-input.mjs'
import { toResponse } from './send-response.mjs'

import type {
  SrvxAdapterOptions,
  SrvxEnvironment,
  SrvxListenOptions,
  SrvxRequest,
  SrvxServer,
} from './environment.mjs'

type MaybePromise<T> = T | Promise<T>

/** How often `close()` looks whether a request is still in flight. */
const POLL_MS = 20

/** The default of `Bun.serve`, in seconds. */
const DEFAULT_BUN_IDLE_TIMEOUT = 10

/** Said once per `listen()` on Bun, where the adapter of Bun is the faster one. */
const BUN_WARNING =
  '[Navios] @navios/adapter-srvx is running on Bun. @navios/adapter-bun uses the router and the ' +
  'streams of Bun.serve and is faster there: use defineBunEnvironment() unless the application ' +
  'has to run on other runtimes as well.'

/** How long `close()` waits once it has dropped every connection. */
const FORCED_CLOSE_MS = 1000

/** The answer to a request that matched no route, before the server has set its own. */
const NOT_FOUND: RouteExecutor = () => encodeResult({ status: 404, body: undefined, kind: 'empty' })

export class SrvxAdapter implements HttpAdapter<SrvxEnvironment> {
  private srvxServer: SrvxServer | null = null
  private isListening = false
  private isClosing = false
  /** The connections of a server of Node. */
  private readonly sockets = new Set<Socket>()
  private readonly table = new RouteTable<RouteExecutor>()
  private notFound: RouteExecutor = NOT_FOUND
  /** The requests that are being handled, and the streams that are being sent. */
  private inFlight = 0
  private readonly cors: Cors | null
  private readonly bodyLimit: number

  constructor(
    private readonly options: SrvxAdapterOptions,
    private readonly context: AdapterContext,
  ) {
    this.cors = options.cors ? new Cors(options.cors) : null
    this.bodyLimit = options.serve?.maxRequestBodySize ?? Infinity
  }

  /**
   * The server of srvx. Before `listen()` it is one that does not listen: its
   * `fetch` is for a runtime that calls the application itself. `listen()`
   * replaces it with the one that listens.
   */
  get server(): SrvxServer {
    return (this.srvxServer ??= this.create({}))
  }

  private create(listen: SrvxListenOptions): SrvxServer {
    const { serve: options } = this.options
    return serve({
      silent: true,
      gracefulShutdown: false,
      error: (error) => this.failure(error),
      ...options,
      // The adapter enforces the limit itself, to answer with a problem
      // response on every runtime. The check of Bun must not come first.
      maxRequestBodySize: undefined,
      bun:
        options?.maxRequestBodySize === undefined
          ? options?.bun
          : { maxRequestBodySize: Number.MAX_SAFE_INTEGER, ...options.bun },
      ...listen,
      manual: true,
      fetch: this.fetch,
    })
  }

  /** Handles a request of the server. */
  private readonly fetch = (request: SrvxRequest): MaybePromise<Response> => {
    this.inFlight++
    let response: MaybePromise<Response>
    try {
      response = this.dispatch(request)
    } catch (error) {
      response = this.failure(error, request)
    }
    if (response instanceof Promise) {
      return response
        .catch((error) => this.failure(error, request))
        .finally(() => {
          this.inFlight--
        })
    }
    this.inFlight--
    return response
  }

  /** Finds the route of a request, which may be one of `inject()`. */
  private dispatch(request: SrvxRequest, test?: TestRequest): MaybePromise<Response> {
    const path = canonicalPath(request.url)
    let match: RouteMatch<RouteExecutor> | undefined
    try {
      match = this.table.match(request.method, path)
    } catch {
      // Percent-encoding that is not valid: a url param would hold what nobody sent.
      return this.run(() => encodeResult(malformedPath(path)), request, {}, test, false)
    }
    // A preflight request is answered here, also on a path with an `OPTIONS` route.
    const isPreflight = this.cors !== null && Cors.isPreflight(request)
    return match === undefined
      ? this.run(this.notFound, request, {}, test, isPreflight)
      : this.run(match.value, request, match.urlParams, test, isPreflight)
  }

  /**
   * Asks CORS about the origin of the request, once, and then has it handled.
   * A preflight request of an allowed origin is answered here.
   */
  private run(
    execute: RouteExecutor,
    request: SrvxRequest,
    params: Record<string, string>,
    test: TestRequest | undefined,
    isPreflight: boolean,
  ): MaybePromise<Response> {
    const { cors } = this
    if (cors === null) {
      return this.handle(execute, request, params, test, null)
    }
    // Asked first: if it fails, the handler must not have run.
    const allowed = cors.check(request)
    if (allowed instanceof Promise) {
      return allowed.then(
        (origin) =>
          isPreflight && origin !== null
            ? cors.preflight(request, origin)
            : this.handle(execute, request, params, test, origin),
        (error) => this.failure(error, request),
      )
    }
    return isPreflight && allowed !== null
      ? cors.preflight(request, allowed)
      : this.handle(execute, request, params, test, allowed)
  }

  private handle(
    execute: RouteExecutor,
    request: SrvxRequest,
    params: Record<string, string>,
    test: TestRequest | undefined,
    allowedOrigin: string | null,
  ): MaybePromise<Response> {
    const send = (response: RouteResponse): Response => {
      const headers = toWebHeaders(response.headers)
      this.cors?.apply(headers, allowedOrigin)
      if (this.isClosing && request.runtime?.node?.req.httpVersionMajor === 1) {
        // Tell the client not to reuse the connection it is being answered on.
        headers.set('connection', 'close')
      }
      this.inFlight++
      if (test === undefined) {
        response = this.keepOpen(response, request)
      }
      return toResponse(response, headers, request, test !== undefined, () => {
        this.inFlight--
      })
    }
    const declared = request.headers.get('content-length')
    let isEmpty = declared === '0'
    let isLimited = false
    if (declared !== null) {
      if (Number(declared) > this.bodyLimit) {
        // Answered here, as Bun and Fastify do: before guards, and whether or
        // not the route reads a body.
        return send(this.context.errors.unexpected(bodyTooLarge()))
      }
    } else if (!hasBody(request)) {
      isEmpty = true
    } else if (this.bodyLimit !== Infinity) {
      // A body of unknown length, sent with chunked transfer encoding, is
      // counted while it is read. One of `inject()` has a declared length.
      limitBody(request, this.bodyLimit)
      isLimited = true
    }
    const input = new SrvxRouteInput(
      request,
      params,
      this.srvxServer,
      isEmpty,
      isLimited,
      test?.remoteAddress,
    )
    const respond = (response: RouteResponse): Response => {
      try {
        return send(response)
      } catch (error) {
        // Whatever stops the response from being sent, the request is released.
        void response.release?.()
        return this.failure(error, request)
      }
    }
    const response = execute(input)
    return response instanceof Promise ? response.then(respond) : respond(response)
  }

  /**
   * Lets an event stream be quiet on Bun, which closes a connection on which
   * nothing has been sent for `idleTimeout`.
   */
  private keepOpen(response: RouteResponse, request: SrvxRequest): RouteResponse {
    const { body, release } = response
    const server = request.runtime?.bun?.server
    if (server === undefined || !(body instanceof ManagedBody) || body.opening === null) {
      return response
    }
    const idleTimeout: number = this.options.serve?.bun?.idleTimeout ?? DEFAULT_BUN_IDLE_TIMEOUT
    server.timeout(request, 0)
    return {
      ...response,
      release: async () => {
        // The connection may stay open for another request.
        server.timeout(request, idleTimeout)
        await release?.()
      },
    }
  }

  private failure(error: unknown, request?: Request): Response {
    const at =
      request === undefined ? null : { method: request.method, path: canonicalPath(request.url) }
    const response = this.context.errors.unexpected(error, at)
    const headers = toWebHeaders(response.headers)
    this.cors?.apply(headers, null)
    return new Response(response.body as BodyInit | null, { status: response.status, headers })
  }

  register({ info, path, execute }: CompiledRoute): void {
    this.table.add(info.method, path, execute)
  }

  setNotFound(execute: RouteExecutor): void {
    this.notFound = execute
  }

  async ready(): Promise<void> {}

  async listen(options: SrvxListenOptions = {}): Promise<string> {
    // One that was made for its `fetch` holds no connection.
    await this.srvxServer?.close()
    const server = this.create(options)
    this.srvxServer = server
    const keep = (socket: Socket) => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    }
    // What a TLS connection has read itself includes the handshake.
    server.node?.server?.on('connection', keep).on('secureConnection', keep)
    await server.serve()
    await server.ready()
    if (server.runtime === 'bun') {
      this.context.logger.warn(BUN_WARNING)
    }
    this.isListening = true
    return (server.url ?? '').replace(/\/$/, '')
  }

  async inject(request: TestRequest): Promise<TestResponse> {
    this.inFlight++
    try {
      return await injectRequest(request, (native) => this.dispatch(native, request))
    } finally {
      this.inFlight--
    }
  }

  async close(timeoutMs: number): Promise<void> {
    const server = this.srvxServer
    const deadline = Date.now() + timeoutMs
    const pause = () => new Promise((resolve) => setTimeout(resolve, POLL_MS))
    this.isClosing = true
    try {
      if (server === null || !this.isListening) {
        // What is in flight are requests of `inject()`, or of a runtime that
        // calls `fetch` itself.
        while (this.inFlight > 0 && Date.now() < deadline) {
          await pause()
        }
        return
      }
      let isClosed = false
      // Accepts no more connections.
      const closing = server.close().then(
        () => {
          isClosed = true
        },
        () => {
          isClosed = true
        },
      )
      const nodeServer = server.node?.server
      while (!isClosed && Date.now() < deadline) {
        if (nodeServer === undefined) {
          // On Bun, what closing resolves with would also wait for connections
          // that clients opened ahead of time and have not used.
          if (this.inFlight === 0 && (server.bun?.server?.pendingRequests ?? 0) === 0) {
            break
          }
        } else {
          // Closing a server of Node drops the keep-alive connections that are
          // idle at that moment. One whose response was under way becomes idle
          // later, and one that a client has not used does not count as idle.
          ;(nodeServer as Partial<HttpServer>).closeIdleConnections?.()
          for (const socket of this.sockets) {
            if (socket.bytesRead === 0) {
              socket.destroy()
            }
          }
        }
        await Promise.race([closing, pause()])
      }
      // A request that has outlived the timeout learns of it when its
      // connection has been closed, and has to before the server releases
      // what it holds.
      const dropped = Array.from(this.sockets, (socket) => {
        const gone = new Promise<void>((resolve) => socket.once('close', () => resolve()))
        socket.destroy()
        return gone
      })
      await settledWithin(
        Promise.all([server.close(true).catch(() => {}), ...dropped]),
        FORCED_CLOSE_MS,
      )
    } finally {
      this.srvxServer = null
      this.isListening = false
    }
  }
}

/** Whether a request without a declared length has a body. */
function hasBody(request: SrvxRequest): boolean {
  const node = request.runtime?.node?.req
  if (node !== undefined && node.httpVersionMajor < 2) {
    // The request of srvx has a body for every method that may have one.
    return node.headers['transfer-encoding'] !== undefined
  }
  return request.body !== null
}
