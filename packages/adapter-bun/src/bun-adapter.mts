import {
  bodyTooLarge,
  canonicalPath,
  encodeResult,
  isEventStream,
  malformedPath,
  ManagedBody,
  RouteTable,
} from '@navios/server/adapter'

import type {
  AdapterContext,
  CompiledRoute,
  HttpAdapter,
  RouteExecutor,
  RoutePath,
  RouteResponse,
  TestRequest,
  TestResponse,
} from '@navios/server/adapter'
import type { BunRequest } from 'bun'

import { DEFAULT_BODY_LIMIT, limitBody } from './body-limit.mjs'
import { Cors } from './cors.mjs'
import { injectRequest } from './inject.mjs'
import { BunRouteInput } from './request-input.mjs'
import { toResponse } from './send-response.mjs'

import type {
  BunAdapterOptions,
  BunEnvironment,
  BunListenOptions,
  BunServer,
} from './environment.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type MaybePromise<T> = T | Promise<T>

/** What a route does with a request, which may be one of `inject()`. */
type Handle = (
  request: Request,
  params: Record<string, string>,
  test?: TestRequest,
) => MaybePromise<Response>

/** The methods that the router of `Bun.serve` is documented to know. */
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

/** The default of `Bun.serve`, in seconds. */
const DEFAULT_IDLE_TIMEOUT = 10

/** How often `close()` looks whether a request is still in flight. */
const POLL_MS = 20

export class BunAdapter<WebSocketData = undefined> implements HttpAdapter<
  BunEnvironment<WebSocketData>
> {
  private bunServer: BunServer<WebSocketData> | null = null
  private readonly routes: Record<
    string,
    Record<string, (request: BunRequest) => MaybePromise<Response>>
  > = {}
  /** The routes as `inject()` finds them: like Bun, by what the client sends. */
  private readonly table = new RouteTable<Handle>((segment) => segment)
  private notFound: RouteExecutor | null = null
  /** How many requests of `inject()` are in flight. Bun counts those of the server. */
  private injected = 0
  private readonly cors: Cors | null
  private readonly bodyLimit: number
  /** The requests that have become WebSockets, if the server takes any. */
  private readonly upgraded: WeakSet<Request> | null

  constructor(
    private readonly options: BunAdapterOptions<WebSocketData>,
    private readonly context: AdapterContext,
  ) {
    this.cors = options.cors ? new Cors(options.cors) : null
    this.bodyLimit = options.serve?.maxRequestBodySize ?? DEFAULT_BODY_LIMIT
    this.upgraded = (options.serve as any)?.websocket ? new WeakSet() : null
  }

  get server(): BunServer<WebSocketData> {
    if (this.bunServer === null) {
      throw new Error('[Navios] The Bun server is created by listen(); call listen() first.')
    }
    return this.bunServer
  }

  private run(
    execute: RouteExecutor,
    request: Request,
    params: Record<string, string>,
    test?: TestRequest,
  ): MaybePromise<Response> {
    // Asked first: if it fails, the handler must not have run.
    const allowed = this.cors === null ? null : this.cors.check(request)
    return allowed instanceof Promise
      ? allowed.then(
          (origin) => this.handle(execute, request, params, test, origin),
          (error) => this.failure(error, request),
        )
      : this.handle(execute, request, params, test, allowed)
  }

  private handle(
    execute: RouteExecutor,
    request: Request,
    params: Record<string, string>,
    test: TestRequest | undefined,
    allowedOrigin: string | null,
  ): MaybePromise<Response> {
    const send = (response: RouteResponse): Response => {
      const native = toResponse(response, request, test !== undefined)
      this.cors?.apply(native.headers, allowedOrigin)
      return native
    }
    const declared = request.headers.get('content-length')
    let isEmpty = declared === '0'
    if (declared !== null) {
      if (Number(declared) > this.bodyLimit) {
        // Answered here, as Bun and Fastify do: before guards, and whether or
        // not the route reads a body. Bun discards the body without buffering.
        return send(this.context.errors.unexpected(bodyTooLarge()))
      }
    } else if (request.body !== null) {
      // A body of unknown length (chunked transfer encoding, or `inject()`)
      // is counted while it is read.
      limitBody(request, this.bodyLimit)
    } else {
      isEmpty = true
    }
    const { upgraded } = this
    const server = this.bunServer as BunServer | null
    const input = new BunRouteInput(request, params, server, isEmpty, test?.remoteAddress)
    if (upgraded !== null) {
      input.responded = () => upgraded.has(request)
    }
    const respond = (response: RouteResponse): Response => {
      const { release, takenOver } = response
      if (takenOver) {
        // Bun has answered, and takes no other response. It ignores the error
        // response of a handler that failed after the upgrade as well.
        void release?.()
        return new Response(null)
      }
      if (release !== undefined) {
        // What reads the request while the response is sent, or when it has
        // been, may find Bun's request gone.
        input.keep(response.body instanceof ManagedBody)
      }
      try {
        return send(test === undefined ? this.keepOpen(response, request) : response)
      } catch (error) {
        // Whatever stops the response from being sent, the request is released
        // and Bun does not get to answer with its own error page.
        void release?.()
        return this.failure(error, request)
      }
    }

    const response = execute(input)
    return response instanceof Promise ? response.then(respond) : respond(response)
  }

  /**
   * Lets an event stream be quiet. Bun closes a connection on which nothing
   * has been sent for `idleTimeout`.
   */
  private keepOpen(response: RouteResponse, request: Request): RouteResponse {
    const { body, headers, release } = response
    const server = this.bunServer
    if (server === null || !(body instanceof ManagedBody) || !isEventStream(headers)) {
      return response
    }
    const { idleTimeout = DEFAULT_IDLE_TIMEOUT } = (this.options.serve ?? {}) as {
      idleTimeout?: number
    }
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
    const response = toResponse(this.context.errors.unexpected(error, at), request, false)
    this.cors?.apply(response.headers, null)
    return response
  }

  register({ info, path, execute }: CompiledRoute): void {
    const { method } = info
    if (!METHODS.includes(method)) {
      throw new Error(
        `[Navios] ${method} ${info.path} cannot be served: the router of Bun knows the methods ` +
          `${METHODS.join(', ')}.`,
      )
    }
    let handle: Handle = (request, params, test) => this.run(execute, request, params, test)
    if (method === 'OPTIONS' && this.cors !== null) {
      const inner = handle
      handle = async (request, params, test) =>
        (await this.preflight(request)) ?? inner(request, params, test)
    }
    const sent = toSentPath(path)
    this.table.add(method, sent, handle)
    ;(this.routes[toBunPath(sent)] ??= {})[method] = this.matched(sent, handle)
  }

  /** What the router of Bun calls for a request that matched a route. */
  private matched(
    path: RoutePath,
    handle: Handle,
  ): (request: BunRequest) => MaybePromise<Response> {
    const { segments, params: names } = path
    if (segments.some((segment) => 'literal' in segment && segment.literal.includes(':'))) {
      // Bun finds the route, and takes what follows the colon for one of its params.
      return (request) => {
        let params: Record<string, string>
        try {
          params = paramsIn(canonicalPath(request.url), path)
        } catch {
          return this.malformed(request)
        }
        return handle(request, params)
      }
    }
    return (request) => {
      const params = request.params as Record<string, string>
      for (const name of names) {
        if (params[name].includes('\uFFFD') && !isDecodable(request)) {
          return this.malformed(request)
        }
      }
      return handle(request, params)
    }
  }

  setNotFound(execute: RouteExecutor): void {
    this.notFound = execute
  }

  async ready(): Promise<void> {}

  /**
   * Answers a path whose percent-encoding is not valid. Bun replaces it, so a
   * url param would hold what nobody sent.
   */
  private malformed(request: Request): MaybePromise<Response> {
    const path = canonicalPath(request.url)
    return this.run(() => encodeResult(malformedPath(path)), request, {})
  }

  /** The response to a CORS preflight request, or `null` for any other request. */
  private async preflight(request: Request): Promise<Response | null> {
    const { cors } = this
    if (cors === null || !Cors.isPreflight(request)) {
      return null
    }
    try {
      const allowed = await cors.check(request)
      return allowed === null ? null : cors.preflight(request, allowed)
    } catch (error) {
      return this.failure(error, request)
    }
  }

  /** Handles a request that matched no route: CORS preflight, then 404. */
  private fallback(request: Request, test?: TestRequest): MaybePromise<Response> {
    const { notFound } = this
    const answer = () =>
      notFound === null
        ? new Response(null, { status: 404 })
        : this.run(notFound, request, {}, test)
    return this.cors === null
      ? answer()
      : this.preflight(request).then((response) => response ?? answer())
  }

  async listen(options: BunListenOptions = {}): Promise<string> {
    const { serve } = this.options
    const address =
      (serve as { unix?: string } | undefined)?.unix === undefined
        ? { port: options.port ?? 3000, hostname: options.hostname ?? 'localhost' }
        : options
    const server = Bun.serve({
      ...(serve as object),
      // The adapter enforces the limit itself, to answer with a problem
      // response. Bun's own check must not come first.
      maxRequestBodySize: Number.MAX_SAFE_INTEGER,
      routes: this.routes,
      ...address,
      fetch: (request: Request) => this.fallback(request),
      error: serve?.error ?? ((error: unknown) => this.failure(error)),
    } as any) as BunServer<WebSocketData>
    const { upgraded } = this
    if (upgraded !== null) {
      const upgrade = server.upgrade.bind(server) as (...args: unknown[]) => boolean
      server.upgrade = (request: Request, ...rest: unknown[]) => {
        const isUpgraded = upgrade(request, ...rest)
        if (isUpgraded) {
          upgraded.add(request)
        }
        return isUpgraded
      }
    }
    this.bunServer = server
    return server.url.toString().replace(/\/$/, '')
  }

  async inject(request: TestRequest): Promise<TestResponse> {
    this.injected++
    try {
      return await injectRequest(request, (native, path) => {
        const match = this.table.match(native.method, path)
        if (match === undefined) {
          return this.fallback(native, request)
        }
        const { urlParams } = match
        try {
          for (const name in urlParams) {
            urlParams[name] = decodeURIComponent(urlParams[name])
          }
        } catch {
          return this.malformed(native)
        }
        return match.value(native, urlParams, request)
      })
    } finally {
      this.injected--
    }
  }

  async close(timeoutMs: number): Promise<void> {
    const server = this.bunServer
    // Accepts no more connections. What it resolves with would also wait for
    // connections that clients opened ahead of time and have not used.
    void server?.stop(false)
    const deadline = Date.now() + timeoutMs
    while (
      (this.injected > 0 || (server !== null && server.pendingRequests > 0)) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    await server?.stop(true)
    this.bunServer = null
  }
}

/** Whether the path of a request is valid percent-encoding. */
function isDecodable(request: Request): boolean {
  try {
    decodeURIComponent(canonicalPath(request.url))
    return true
  } catch {
    return false
  }
}

/** The path as a client sends it: Bun compares it as it is. */
function toSentPath({ segments, params }: RoutePath): RoutePath {
  return {
    segments: segments.map((segment) =>
      'param' in segment
        ? segment
        : { literal: new URL(`http://localhost/${segment.literal}`).pathname.slice(1) },
    ),
    params,
  }
}

function toBunPath({ segments }: RoutePath): string {
  return segments
    .map((segment) => ('param' in segment ? `/:${segment.param}` : `/${segment.literal}`))
    .join('')
}

/** The url params in a path that matched. Throws for percent-encoding that is not valid. */
function paramsIn(path: string, { segments }: RoutePath): Record<string, string> {
  const texts = path.slice(1).split('/')
  const params: Record<string, string> = {}
  segments.forEach((segment, index) => {
    if ('param' in segment) {
      params[segment.param] = decodeURIComponent(texts[index] ?? '')
    }
  })
  return params
}
