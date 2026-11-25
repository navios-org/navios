import { Container } from '@navios/di'

import { ErrorPipeline } from '../errors/error-pipeline.mjs'
import {
  ForbiddenResponder,
  InternalServerErrorResponder,
  NotFoundResponder,
  ValidationErrorResponder,
} from '../errors/index.mjs'
import { compileRoute } from '../pipeline/compile-route.mjs'
import { compileRoutePath } from '../routing/route-path.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { ErrorPipelineOptions } from '../errors/error-pipeline.mjs'
import type { CompileOptions, RouteDefinition } from '../pipeline/compile-route.mjs'
import type { ResponseEncoder } from '../pipeline/response-encoder.mjs'
import type { HttpGuard as Guard, HttpInterceptor as Interceptor } from '../routing/index.mjs'
import type { RouteEndpointConfig, RouteInfo } from '../routing/index.mjs'
import type { BodySource, RouteInput } from '../routing/route-input.mjs'
import type { RouteBody, RouteResponse } from '../routing/route-response.mjs'

/** A body with the given bytes or, with a function, what that returns as it is. */
export function body(
  content: string | Uint8Array | (() => unknown) | undefined,
  contentType: string | undefined = 'application/json',
): BodySource {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : (content ?? new Uint8Array())
  return {
    contentType,
    isEmpty: typeof bytes !== 'function' && bytes.byteLength === 0,
    bytes: () => (typeof bytes === 'function' ? new Uint8Array() : bytes),
    parts: async function* () {},
    parsed: () => (typeof bytes === 'function' ? { value: bytes() } : undefined),
  }
}

export function input(
  overrides: Partial<Omit<RouteInput, 'body'>> & {
    headerMap?: Record<string, string>
    body?: BodySource | (() => unknown)
  } = {},
): RouteInput {
  const { headerMap = {}, body: content, ...rest } = overrides
  return {
    method: 'GET',
    path: '/test',
    url: () => 'http://localhost/test',
    remoteAddress: () => undefined,
    header: (name) => headerMap[name.toLowerCase()],
    headers: () => new Headers(headerMap),
    urlParams: {},
    query: () => ({}),
    body: typeof content === 'object' ? content : body(content),
    signal: () => new AbortController().signal,
    raw: { native: true },
    ...rest,
  }
}

export interface SetupOptions {
  guards?: Guard[]
  /** Around the guards, as those of the application. */
  outer?: Interceptor[]
  /** Behind the guards, as those of a module, a controller or a handler. */
  interceptors?: Interceptor[]
  validateResponses?: boolean
  exposeErrorDetails?: boolean
  container?: Container
  onUnhandled?: (error: unknown) => void
  /** Full route path, when a prefix makes it differ from the endpoint's url. */
  path?: string
  responders?: Partial<ErrorPipelineOptions>
  encoders?: Record<string, ResponseEncoder>
  logger?: CompileOptions['host']['logger']
  asyncContext?: boolean
  live?: Set<RequestContext>
}

/** A response with its JSON body parsed. */
export interface Answer extends Omit<RouteResponse, 'body' | 'headers'> {
  headers: Record<string, string | string[]>
  // oxlint-disable-next-line no-explicit-any
  body: any
  /** The body as an adapter gets it. */
  sent: RouteBody
}

export const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' }

function parse(response: RouteResponse): Answer {
  const { status, body, release } = response
  const headers = response.headers as Answer['headers']
  const isJson = typeof body === 'string' && String(headers['content-type']).includes('json')
  return { status, headers, release, sent: body, body: isJson ? JSON.parse(body) : body }
}

/** Compiles one route, and what is needed to look at it. */
export function setup(
  config: Partial<RouteEndpointConfig>,
  invoke: RouteDefinition['invoke'],
  extra: SetupOptions = {},
) {
  const container = extra.container ?? new Container()
  const unhandled: unknown[] = []
  const errors = new ErrorPipeline({
    notFound: new NotFoundResponder(),
    forbidden: new ForbiddenResponder(),
    validation: new ValidationErrorResponder(),
    internal: new InternalServerErrorResponder(),
    exposeErrorDetails: extra.exposeErrorDetails ?? false,
    onUnhandled: extra.onUnhandled ?? ((error) => unhandled.push(error)),
    ...extra.responders,
  })
  const endpoint: RouteEndpointConfig = { method: 'GET', url: '/test', ...config }
  const info: RouteInfo = {
    method: endpoint.method,
    path: extra.path ?? endpoint.url,
    endpoint,
    module: null,
    controller: class TestController {},
    handlerName: 'handle',
    guards: [],
    interceptors: [],
    attributes: { handler: new Map(), controller: new Map(), module: new Map() },
  }
  const compiled = compileRoute(
    {
      info,
      path: compileRoutePath(info.path),
      invoke,
      guards: extra.guards ?? [],
      outer: extra.outer ?? [],
      inner: extra.interceptors ?? [],
    },
    {
      host: { container, onScopedUse: null, logger: extra.logger },
      errors,
      validateResponses: extra.validateResponses ?? true,
      encoders: new Map(Object.entries(extra.encoders ?? {})),
      asyncContext: extra.asyncContext,
      live: extra.live,
    },
  )
  const execute = (request: RouteInput): Answer | Promise<Answer> => {
    const response = compiled(request)
    return response instanceof Promise ? response.then(parse) : parse(response)
  }
  return { execute, errors, unhandled, container }
}

export async function drain(answer: Answer): Promise<unknown[]> {
  const chunks: unknown[] = []
  for await (const chunk of answer.sent as AsyncIterable<unknown>) {
    chunks.push(chunk)
  }
  return chunks
}

export const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms))
