import type { ClassType } from '@navios/di'

/**
 * How a response body is written. Core ships encoders for the first five;
 * a package may register more (for example `xml`).
 */
export type ResponseKind = 'json' | 'text' | 'blob' | 'stream' | 'sse' | 'empty' | (string & {})

export interface CookieOptions {
  domain?: string
  path?: string
  expires?: Date
  maxAge?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}

export interface SetCookie {
  name: string
  value: string
  options?: CookieOptions
}

/**
 * What a route produced, in adapter-neutral form. An adapter writes it to the
 * native response.
 */
export interface RouteResult {
  status: number
  headers?: Record<string, string>
  cookies?: SetCookie[]
  body: unknown
  kind: ResponseKind
  /**
   * Present when the request holds resources (a DI scope, request values
   * with a `dispose` hook). The adapter calls it once the response has been
   * fully sent, or the connection is gone.
   */
  release?: () => void | Promise<void>
}

/**
 * What an adapter hands to a route executor for one request. Everything that
 * may cost something is a function, so a route that does not need it never
 * pays for it.
 */
export interface RouteInput {
  readonly method: string
  /** Request path without the query string. */
  readonly path: string
  /** Adapter-provided request id, if it has one. */
  readonly id?: string
  header(name: string): string | undefined
  /** Every request header, for code that needs a web `Headers` object. */
  headers(): Headers
  readonly urlParams: Record<string, string>
  /** Parsed query string. */
  query(): unknown
  /** Parsed request body. Not called before guards have passed. */
  body(): unknown | Promise<unknown>
  /** Aborts when the client disconnects. */
  signal(): AbortSignal
  /** The adapter's native objects, exposed as `ctx.raw`. */
  readonly raw: unknown
  /**
   * Whether the response was already written through the native objects
   * (`ctx.raw`). The pipeline then skips response validation and the adapter
   * writes nothing. Optional: adapters without a native reply omit it.
   */
  responded?(): boolean
}

export type RouteExecutor = (input: RouteInput) => RouteResult | Promise<RouteResult>

export type AttributeMap = ReadonlyMap<symbol, unknown>

/**
 * Everything known about a route after the application has been initialised.
 */
export interface RouteInfo {
  readonly method: string
  /** Full path with every prefix applied, in builder form (`/users/$id`). */
  readonly path: string
  /** The builder declaration's `config`. */
  readonly endpoint: RouteEndpointConfig
  readonly module: ClassType | null
  readonly controller: ClassType
  readonly handlerName: string
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
  readonly attributes: {
    readonly handler: AttributeMap
    readonly controller: AttributeMap
    readonly module: AttributeMap
  }
}

/**
 * The parts of a builder declaration the server reads. Schemas are Standard
 * Schemas; the builder's own `Schema` type is structurally the same.
 */
export interface RouteEndpointConfig {
  method: string
  url: string
  querySchema?: SchemaLike
  requestSchema?: SchemaLike
  urlParamsSchema?: SchemaLike
  headersSchema?: SchemaLike
  cookiesSchema?: SchemaLike
  responseSchema?: SchemaLike
  responses?: Record<number, SchemaLike | null>
  errorSchema?: Record<number, SchemaLike>
  body?: 'json' | 'multipart'
  response?: 'json' | 'blob' | 'text' | 'stream' | 'void'
}

export type SchemaLike = import('@navios/di').StandardSchemaV1<any, any>

export interface CompiledRoute {
  readonly info: RouteInfo
  readonly execute: RouteExecutor
}
