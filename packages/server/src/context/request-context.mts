import { PlainContextKey } from '@navios/core'
import { ExecutionContextToken } from '@navios/core'
import { DIError, DIErrorCode } from '@navios/di'

import type { ContextValue } from '@navios/core'
import type { ExecutionContext } from '@navios/core'
import type { ContextHost } from '@navios/core/transport'
import type { AnyInjectableType, ScopedContainer } from '@navios/di'

import { adopt } from '../internal/promises.mjs'

import type { SetCookie } from '../routing/cookies.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'
import type { RouteInput } from '../routing/route-input.mjs'

import { RequestContextToken } from './request-context-token.mjs'

import type { AdapterEnvironment, RegisteredEnvironment } from './environment.mjs'
import type { ContextKey } from './http-context-key.mjs'
import type { ReplyControls } from './reply-controls.mjs'
import type { RequestCookies, RequestHeaders, RequestQuery } from './request-data.mjs'
import type { RequestValueClass, RequestValueProvider } from './request-value.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

let requestCounter = 0

/**
 * One request. Passed to guards and interceptors, and as the second argument
 * to handlers. Everything on it is adapter-neutral except `raw`.
 */
export class RequestContext<
  Env extends AdapterEnvironment = RegisteredEnvironment,
> implements ExecutionContext {
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
  private parsedQuery: RequestQuery | null = null
  /**
   * Whether the response has finished: nothing more will be released, so
   * nothing more may be acquired. Set by `release()`, and by the pipeline for
   * a response that holds nothing to release.
   * @internal
   */
  released = false
  private finishers: Array<() => void | Promise<void>> | null = null
  /**
   * The status of the response, once it is known: after the handler, response
   * validation and error mapping. `undefined` before that. Read it in an
   * `onFinish` callback to learn the final status, including the status an
   * error was mapped to.
   */
  responseStatus: number | undefined = undefined
  /** @internal */
  responseHeaders: Record<string, string> | null = null
  /** @internal */
  responseCookies: SetCookie[] | null = null

  constructor(
    private readonly input: RouteInput,
    public readonly route: RouteInfo,
    private readonly host: ContextHost,
  ) {}

  /** The transport kind. A getter, so that it adds nothing to the instance. */
  get kind(): 'http' {
    return 'http'
  }

  /** The route, under the name every transport's context has for it. */
  get handler(): RouteInfo {
    return this.route
  }

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

  /**
   * The URL params of the whole path, module and global prefixes included, as
   * decoded strings. Not validated: guards run before validation. A handler
   * gets the validated params in its first argument.
   */
  get urlParams(): Readonly<Record<string, string>> {
    return this.input.urlParams
  }

  /**
   * The parsed query string, not validated. A handler gets the validated
   * query in its first argument.
   */
  get query(): RequestQuery {
    return (this.parsedQuery ??= (this.input.query() ?? {}) as RequestQuery)
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
    // Without a prototype: cookie names come from the client, and `toString`
    // or `constructor` must be neither found when not sent nor lost when sent.
    const jar: Record<string, string> = Object.create(null)
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
    let provider: RequestValueProvider<unknown>
    try {
      provider = this.host.container.getSync(key) as RequestValueProvider<unknown>
    } catch (error) {
      if (!(error instanceof DIError) || error.code !== DIErrorCode.AsyncInitRequired) {
        throw error
      }
      return this.computeLater(key, error)
    }
    this.assertNotReleased(key, provider)
    resolving.push(key)
    let value: unknown
    try {
      // A lazy thenable (a query builder) would run again for every reader
      // that awaits it; as a promise it runs once.
      value = adopt(provider.resolve(this as unknown as RequestContext))
    } finally {
      resolving.pop()
    }
    ;(this.slots ??= new Map()).set(key, value)
    if (typeof provider.dispose === 'function') {
      ;(this.disposers ??= []).push([provider, value])
    }
    return value
  }

  /**
   * Computes a request value whose class is still waiting for an asynchronous
   * initialiser of a dependency. Only a value that is known to be a promise
   * can be handed out as one: for any other, the reader would take the
   * promise for the value itself.
   */
  private computeLater(key: RequestValueClass, cause: DIError): unknown {
    if (Object.prototype.toString.call(key.prototype?.resolve) !== '[object AsyncFunction]') {
      throw new Error(
        `[Navios] Request value ${key.name} was read before a dependency with an asynchronous ` +
          `initialiser was ready. Have it built while the application initialises: list it in a ` +
          `module, @Module({ requestValues: [${key.name}] }).`,
        { cause },
      )
    }
    const value = (this.host.container.get(key) as Promise<RequestValueProvider<unknown>>).then(
      (provider) => {
        this.assertNotReleased(key, provider)
        const resolved = provider.resolve(this as unknown as RequestContext)
        if (typeof provider.dispose === 'function') {
          ;(this.disposers ??= []).push([provider, resolved])
        }
        return resolved
      },
    )
    ;(this.slots ??= new Map()).set(key, value)
    return value
  }

  private assertNotReleased(key: RequestValueClass, provider: RequestValueProvider<unknown>): void {
    if (this.released && typeof provider.dispose === 'function') {
      throw new Error(
        `[Navios] Request value ${key.name} cannot be computed: the response has finished, so ` +
          `nothing would dispose it.`,
      )
    }
  }

  // --------------------------------------------------------------------------
  // Request-scoped services
  // --------------------------------------------------------------------------

  /** @internal */
  scopeFor(token: AnyInjectableType): ScopedContainer {
    this.host.onScopedUse?.(token)
    if (this.scope === null) {
      if (this.released) {
        throw new Error(
          '[Navios] Request-scoped services cannot be used: the response has finished, so nothing ' +
            'would dispose them.',
        )
      }
      this.scope = this.host.container.createScope()
      this.scope.addInstance(RequestContextToken, this as unknown as RequestContext)
      this.scope.addInstance(ExecutionContextToken, this as unknown as RequestContext)
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

  /**
   * Runs `callback` when the response has finished: after the body has been
   * sent, a stream has ended, or the client has gone away. Callbacks run in
   * reverse registration order, before request values and the DI scope are
   * disposed. An interceptor uses this to end a span or record a duration
   * with the final `responseStatus`. A callback registered after the response
   * has finished runs at once.
   */
  onFinish(callback: () => void | Promise<void>): void {
    if (this.released) {
      void runQuietly(callback)
      return
    }
    ;(this.finishers ??= []).push(callback)
  }

  // --------------------------------------------------------------------------
  // Disposal
  // --------------------------------------------------------------------------

  /**
   * Whether anything has to be released when the response has finished.
   * @internal
   */
  get needsRelease(): boolean {
    return this.scope !== null || this.disposers !== null || this.finishers !== null
  }

  /**
   * Runs `dispose` hooks of computed request values in reverse order, then
   * disposes the DI scope.
   * @internal
   */
  async release(): Promise<void> {
    const finishers = this.finishers
    this.finishers = null
    if (finishers !== null) {
      for (let i = finishers.length - 1; i >= 0; i--) {
        await runQuietly(finishers[i])
      }
    }
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
    this.released = true
    if (scope !== null) {
      await scope.dispose()
    }
  }
}

/** Runs a callback whose failure must not stop what follows. */
async function runQuietly(callback: () => void | Promise<void>): Promise<void> {
  try {
    await callback()
  } catch {
    // Nothing to report it to: the response is gone.
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
