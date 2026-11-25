import { problem } from '@navios/core'

import type {
  AdapterContext,
  CompiledRoute,
  HttpAdapter,
  RouteExecutor,
  RouteResult,
  SchemaLike,
  TestRequest,
  TestResponse,
} from '@navios/core'
import type { BunRequest } from 'bun'

import { BODY_TOO_LARGE, declaresTooLarge, DEFAULT_BODY_LIMIT } from './body-limit.mjs'
import { applyCorsToResponse, calculatePreflightHeaders, isPreflight } from './cors.mjs'
import { compilePath, injectRequest } from './inject.mjs'
import { BunRouteInput } from './request-input.mjs'
import { toResponse } from './send-result.mjs'

import type {
  BunAdapterOptions,
  BunEnvironment,
  BunListenOptions,
  BunServer,
} from './environment.mjs'
import type { Matcher } from './inject.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

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

  inject(request: TestRequest): Promise<TestResponse> {
    return injectRequest(request, this.matchers, (native) => this.fallback(native))
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
