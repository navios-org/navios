type MaybePromise<T> = T | Promise<T>

/**
 * What an origin is compared with: the origin itself, `'*'` for any origin, a
 * pattern, or `true` for any origin and `false` for none.
 */
export type CorsOrigin = string | boolean | RegExp | (string | boolean | RegExp)[]

/**
 * Decides about the origin of a request, like the function that
 * `@fastify/cors` takes: it calls the callback, or returns a promise of what
 * the origin is compared with. A function that takes no callback may return
 * that as it is; what one with a callback returns, unless it is a promise,
 * decides nothing. An error fails the request, before the handler runs. Not
 * called for a request without an origin.
 */
export type OriginFunction = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: CorsOrigin) => void,
) => CorsOrigin | void | Promise<CorsOrigin | void>

/**
 * CORS options of an adapter that answers with a web `Response`. They have the
 * names and the meaning of the options of `@fastify/cors` that the Fastify
 * adapter takes.
 */
export interface CorsOptions {
  /** Allowed origin(s). @default '*' */
  origin?: CorsOrigin | OriginFunction
  credentials?: boolean
  exposedHeaders?: string | string[]
  /** The request headers a preflight allows. Those that it asks for, if not set. */
  allowedHeaders?: string | string[]
  /** The methods a preflight allows. @default 'GET,HEAD,PUT,PATCH,POST,DELETE' */
  methods?: string | string[]
  maxAge?: number
  cacheControl?: number | string
}

const DEFAULT_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE'

function list(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value
}

function matches(origin: string, value: string | boolean | RegExp): boolean {
  if (value instanceof RegExp) {
    // One with the flag `g` or `y` goes on where it has stopped.
    value.lastIndex = 0
    return value.test(origin)
  }
  return value === origin || value === true
}

/** The value of `Access-Control-Allow-Origin`, or `null` for an origin that is not allowed. */
function allow(origin: string, value: CorsOrigin | void): string | null {
  const values = Array.isArray(value) ? value : [value ?? false]
  if (values.includes('*')) {
    return '*'
  }
  return values.some((candidate) => matches(origin, candidate)) ? origin : null
}

function ask(decide: OriginFunction, origin: string): Promise<CorsOrigin | void> {
  return new Promise((resolve, reject) => {
    const answer = decide(origin, (error, value) => (error ? reject(error) : resolve(value)))
    if (typeof (answer as PromiseLike<unknown> | undefined)?.then === 'function') {
      Promise.resolve(answer).then(resolve, reject)
    } else if (decide.length < 2 && (answer !== undefined || decide.length === 1)) {
      // A function that declares the callback returns whatever its last
      // expression gives, such as the `true` of an emitter that has a
      // listener. One that declares nothing may hand its arguments on.
      resolve(answer)
    }
  })
}

function assertCredentials(allowed: string | null, credentials: boolean | undefined): void {
  if (credentials && allowed === '*') {
    throw new Error(
      '[Navios] CORS with credentials needs an explicit origin: browsers reject ' +
        'Access-Control-Allow-Origin: * on credentialed requests. Set cors.origin to the allowed origin(s).',
    )
  }
}

/** CORS for requests and responses of the web platform. */
export class Cors {
  private readonly origin: CorsOrigin | OriginFunction
  /** Whether every origin gets the same response headers. */
  private readonly isFixed: boolean

  constructor(private readonly options: CorsOptions) {
    // Like @fastify/cors: enabling CORS without an origin allows any origin,
    // and so does a list with `*` in it.
    const { origin = '*' } = options
    this.origin = Array.isArray(origin) && origin.includes('*') ? '*' : origin
    this.isFixed = this.origin === '*' || this.origin === false
    assertCredentials(this.origin === '*' ? '*' : null, options.credentials)
  }

  /** The origin that the response to a request allows. */
  check(request: Request): MaybePromise<string | null> {
    const origin = request.headers.get('origin')
    if (origin === null) {
      return null
    }
    if (typeof this.origin !== 'function') {
      return allow(origin, this.origin)
    }
    return ask(this.origin, origin).then((answer) => {
      const allowed = allow(origin, answer)
      assertCredentials(allowed, this.options.credentials)
      return allowed
    })
  }

  /** Adds the headers to a response. */
  apply(headers: Headers, allowed: string | null): void {
    // For an origin that is not allowed too: a cache must not serve its
    // response to an allowed origin.
    if (!this.isFixed) {
      addVary(headers, 'Origin')
    }
    if (allowed === null) {
      return
    }
    const { credentials, exposedHeaders } = this.options
    headers.set('access-control-allow-origin', allowed)
    if (credentials) {
      headers.set('access-control-allow-credentials', 'true')
    }
    if (exposedHeaders !== undefined) {
      headers.set('access-control-expose-headers', list(exposedHeaders))
    }
  }

  static isPreflight({ method, headers }: Request): boolean {
    return (
      method === 'OPTIONS' && headers.has('origin') && headers.has('access-control-request-method')
    )
  }

  /** The response to a preflight request of an origin that is allowed. */
  preflight(request: Request, allowed: string): Response {
    const { methods, allowedHeaders, maxAge, cacheControl } = this.options
    const headers = new Headers()
    this.apply(headers, allowed)
    headers.set('access-control-allow-methods', list(methods ?? DEFAULT_METHODS))
    if (allowedHeaders !== undefined) {
      headers.set('access-control-allow-headers', list(allowedHeaders))
    } else {
      addVary(headers, 'Access-Control-Request-Headers')
      const requested = request.headers.get('access-control-request-headers')
      if (requested !== null) {
        headers.set('access-control-allow-headers', requested)
      }
    }
    if (maxAge !== undefined) {
      headers.set('access-control-max-age', String(maxAge))
    }
    if (cacheControl !== undefined) {
      headers.set(
        'cache-control',
        typeof cacheControl === 'number' ? `max-age=${cacheControl}` : cacheControl,
      )
    }
    return new Response(null, { status: 204, headers })
  }
}

/** Adds a name to the `Vary` header, keeping what the handler has set. */
function addVary(headers: Headers, name: string): void {
  const names = (headers.get('vary') ?? '').split(',').map((entry) => entry.trim().toLowerCase())
  if (!names.includes('*') && !names.includes(name.toLowerCase())) {
    headers.append('vary', name)
  }
}
