import { InjectableScope, InjectionToken } from '@navios/di'

import type { AnyInjectableType, Container, ScopedContainer } from '@navios/di'

import type { CookieOptions, RouteInfo, RouteInput, SetCookie } from '../routing/types.mjs'

import { PlainContextKey } from './context-key.mjs'

import type {
  ContextKey,
  ContextValue,
  RequestValueClass,
  RequestValueProvider,
} from './context-key.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Declares the application's adapter so that `ctx.raw` is typed:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: FastifyEnvironment
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line no-empty-interface
export interface Register {}

/**
 * What an adapter contributes to the types.
 */
export interface AdapterEnvironment {
  /** The adapter's native request objects, exposed as `ctx.raw`. */
  raw: unknown
}

export type RegisteredEnvironment = Register extends {
  environment: infer E extends AdapterEnvironment
}
  ? E
  : AdapterEnvironment

/**
 * The request context, available to request-scoped services with
 * `inject(RequestContextToken)`.
 */
export const RequestContextToken = InjectionToken.create<RequestContext>('RequestContext', {
  scope: InjectableScope.Request,
})

export interface RequestHeaders {
  get(name: string): string | undefined
  /** All request headers as a web `Headers` object. Built on first call. */
  toWebHeaders(): Headers
}

export interface RequestCookies {
  get(name: string): string | undefined
  all(): Readonly<Record<string, string>>
}

export interface ReplyControls {
  /** Sets a response header. */
  header(name: string, value: string): void
  /** Adds a `Set-Cookie` to the response. */
  cookie(name: string, value: string, options?: CookieOptions): void
}

/**
 * Dependencies shared by every request context of an application.
 * @internal
 */
export interface ContextHost {
  readonly container: Container
  /** Called the first time a request-scoped token is used; may throw. */
  onScopedUse: ((token: AnyInjectableType) => void) | null
}

let requestCounter = 0

/**
 * One request. Passed to guards and interceptors, and as the second argument
 * to handlers. Everything on it is adapter-neutral except `raw`.
 */
export class RequestContext<Env extends AdapterEnvironment = RegisteredEnvironment> {
  private slots: Map<ContextKey, unknown> | null = null
  private resolving: ContextKey[] | null = null
  private disposers: Array<[RequestValueProvider<any>, unknown]> | null = null
  private scope: ScopedContainer | null = null
  private requestId: string | undefined
  private cookieJar: Record<string, string> | null = null
  private webHeaders: Headers | null = null
  private headersView: RequestHeaders | null = null
  private cookiesView: RequestCookies | null = null
  private replyView: ReplyControls | null = null
  /** @internal */
  responseHeaders: Record<string, string> | null = null
  /** @internal */
  responseCookies: SetCookie[] | null = null

  constructor(
    private readonly input: RouteInput,
    public readonly route: RouteInfo,
    private readonly host: ContextHost,
  ) {}

  /** Request id from the adapter, or a process-unique one generated on first read. */
  get id(): string {
    return (this.requestId ??= this.input.id ?? `req-${++requestCounter}`)
  }

  get method(): string {
    return this.input.method
  }

  get path(): string {
    return this.input.path
  }

  /** Aborts when the client disconnects. */
  get signal(): AbortSignal {
    return this.input.signal()
  }

  /** The adapter's native request objects. Typed through `Register`. */
  get raw(): Env['raw'] {
    return this.input.raw as Env['raw']
  }

  // The three views below are created on first access, so a request that
  // never touches them allocates nothing for them.

  get headers(): RequestHeaders {
    return (this.headersView ??= {
      get: (name) => this.input.header(name),
      toWebHeaders: () => (this.webHeaders ??= this.input.headers()),
    })
  }

  get cookies(): RequestCookies {
    return (this.cookiesView ??= {
      get: (name) => this.parseCookies()[name],
      all: () => this.parseCookies(),
    })
  }

  /** Response headers and cookies set from guards, interceptors and handlers. */
  get reply(): ReplyControls {
    return (this.replyView ??= {
      header: (name, value) => {
        ;(this.responseHeaders ??= {})[name.toLowerCase()] = value
      },
      cookie: (name, value, options) => {
        ;(this.responseCookies ??= []).push({ name, value, options })
      },
    })
  }

  private parseCookies(): Record<string, string> {
    if (this.cookieJar !== null) {
      return this.cookieJar
    }
    const jar: Record<string, string> = {}
    const header = this.input.header('cookie')
    if (header) {
      for (const part of header.split(';')) {
        const index = part.indexOf('=')
        if (index < 0) {
          continue
        }
        const name = part.slice(0, index).trim()
        if (name === '' || name in jar) {
          continue
        }
        let value = part.slice(index + 1).trim()
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1)
        }
        try {
          jar[name] = decodeURIComponent(value)
        } catch {
          jar[name] = value
        }
      }
    }
    this.cookieJar = jar
    return jar
  }

  // --------------------------------------------------------------------------
  // Per-request state
  // --------------------------------------------------------------------------

  /**
   * Reads a slot.
   *
   * - A plain key (`createContextKey`) must have been set; otherwise this
   *   throws.
   * - A request value (`@RequestValue`) is computed on first read and
   *   remembered for the rest of the request. If its `resolve` is
   *   asynchronous, the promise is what is remembered and returned, so
   *   concurrent readers share one computation.
   */
  get<K extends ContextKey>(key: K): ContextValue<K> {
    const slots = this.slots
    if (slots !== null) {
      const existing = slots.get(key)
      if (existing !== undefined || slots.has(key)) {
        return existing as ContextValue<K>
      }
    }
    if (key instanceof PlainContextKey) {
      throw new Error(
        `[Navios] Context key ${key.name} is not set for ${this.method} ${this.path}. ` +
          `Set it with ctx.set() (usually in a guard), or read it with ctx.find().`,
      )
    }
    return this.compute(key as RequestValueClass) as ContextValue<K>
  }

  /**
   * Like `get`, but returns `undefined` for a plain key that is not set.
   */
  find<K extends ContextKey>(key: K): ContextValue<K> | undefined {
    const slots = this.slots
    if (slots !== null && slots.has(key)) {
      return slots.get(key) as ContextValue<K>
    }
    if (key instanceof PlainContextKey) {
      return undefined
    }
    return this.compute(key as RequestValueClass) as ContextValue<K>
  }

  /**
   * Fills a slot. Works for plain keys and for request values (the value's
   * `resolve` is then not called for this request).
   */
  set<K extends ContextKey>(key: K, value: Awaited<ContextValue<K>>): void {
    ;(this.slots ??= new Map()).set(key, value)
  }

  /** Whether a slot holds a value, without computing a request value. */
  has(key: ContextKey): boolean {
    return this.slots?.has(key) ?? false
  }

  private compute(key: RequestValueClass): unknown {
    const resolving = (this.resolving ??= [])
    if (resolving.includes(key)) {
      const path = [...resolving.slice(resolving.indexOf(key)), key]
        .map((entry) => (entry as RequestValueClass).name)
        .join(' -> ')
      throw new Error(`[Navios] Circular request values: ${path}`)
    }
    const provider = this.host.container.getSync(key) as RequestValueProvider<unknown>
    resolving.push(key)
    let value: unknown
    try {
      value = provider.resolve(this as unknown as RequestContext)
    } finally {
      resolving.pop()
    }
    ;(this.slots ??= new Map()).set(key, value)
    if (typeof provider.dispose === 'function') {
      ;(this.disposers ??= []).push([provider, value])
    }
    return value
  }

  // --------------------------------------------------------------------------
  // Request-scoped services
  // --------------------------------------------------------------------------

  /** @internal */
  scopeFor(token: AnyInjectableType): ScopedContainer {
    this.host.onScopedUse?.(token)
    if (this.scope === null) {
      this.scope = this.host.container.createScope()
      this.scope.addInstance(RequestContextToken, this as unknown as RequestContext)
    }
    return this.scope
  }

  /**
   * Resolves a service from this request's DI scope, synchronously. The
   * scope is created on first use. Throws `AsyncInitRequired` when the
   * service or a dependency has an asynchronous initialiser; use `resolve()`
   * for those.
   *
   * Prefer a request value (`@RequestValue`) when all you need is data
   * derived from the request.
   */
  declare use: ScopedContainer['getSync']

  /**
   * Resolves a service from this request's DI scope, waiting for
   * asynchronous initialisers.
   */
  declare resolve: ScopedContainer['get']

  // --------------------------------------------------------------------------
  // Disposal
  // --------------------------------------------------------------------------

  /**
   * Whether anything has to be released when the response has finished.
   * @internal
   */
  get needsRelease(): boolean {
    return this.scope !== null || this.disposers !== null
  }

  /**
   * Runs `dispose` hooks of computed request values in reverse order, then
   * disposes the DI scope.
   * @internal
   */
  async release(): Promise<void> {
    const disposers = this.disposers
    this.disposers = null
    if (disposers !== null) {
      for (let i = disposers.length - 1; i >= 0; i--) {
        const [provider, value] = disposers[i]
        try {
          await provider.dispose!(await value, this as unknown as RequestContext)
        } catch {
          // A failing dispose hook must not stop the others.
        }
      }
    }
    const scope = this.scope
    this.scope = null
    if (scope !== null) {
      await scope.dispose()
    }
  }
}

RequestContext.prototype.use = function use(
  this: RequestContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  return (this.scopeFor(token).getSync as any)(token, args)
} as ScopedContainer['getSync']

RequestContext.prototype.resolve = function resolve(
  this: RequestContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  return (this.scopeFor(token).get as any)(token, args)
} as ScopedContainer['get']
