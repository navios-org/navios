import { ExecutionContextToken, PlainContextKey } from '@navios/core'
import { needsScope, runInContext } from '@navios/core/transport'
import { DIError, DIErrorCode } from '@navios/di'
import { disposeScope } from '@navios/di/internal'

import type { ContextValue, ExecutionContext } from '@navios/core'
import type { AnyInjectableType, Container, ScopedContainer } from '@navios/di'

import { parseCookies } from '../decoding/parse-cookies.mjs'
import { readParts } from '../decoding/read-parts.mjs'
import { adopt, ignore, isPromise } from '../internal/promises.mjs'
import { ManagedBody } from '../responses/managed-body.mjs'
import { closeBodies, RequestOwner } from '../responses/request-owner.mjs'
import { appendHeader, describesSuccess, setHeader } from '../responses/response-headers.mjs'
import { cookieKey, serializeCookie } from '../responses/serialize-cookie.mjs'

import type { BodySource, RouteInput } from '../adapter/route-input.mjs'
import type { BodyDecoder } from '../decoding/body-decoder.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { SetCookie } from '../routing/cookies.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'
import type { ResponseHeaders } from '../routing/route-result.mjs'

import { RequestContextToken } from './request-context-token.mjs'

import type { AdapterEnvironment, RegisteredEnvironment } from './environment.mjs'
import type { ContextKey } from './http-context-key.mjs'
import type { ReplyControls } from './reply-controls.mjs'
import type { RequestCookies, RequestHeaders, RequestQuery } from './request-data.mjs'
import type { RequestHost } from './request-host.mjs'
import type { RequestValueClass, RequestValueProvider } from './request-value.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

let requestCounter = 0

const UNREAD = Symbol('unread')

const nextMicrotask: Promise<void> = Promise.resolve()

/** A relative url has no host, and one with an invalid host is not a url. */
function parseUrl(text: string): URL {
  const base = 'http://localhost'
  if (URL.canParse(text, base)) {
    return new URL(text, base)
  }
  const query = text.indexOf('?')
  return new URL(query < 0 ? '/' : `/${text.slice(query)}`, base)
}

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
  private parsedUrl: URL | null = null
  /**
   * Whether the response has finished: nothing more will be released, so
   * nothing more may be acquired. Set by `release()`, and by the pipeline for
   * a response that holds nothing to release.
   * @internal
   */
  released = false
  private releasing: Promise<void> | null = null
  private finishers: Array<() => void | Promise<void>> | null = null
  /** The lazy bodies the request has produced, sent or not. */
  private bodies: ManagedBody[] | null = null
  private requestBody: unknown = UNREAD
  private bytes: MaybePromise<Uint8Array> | null = null
  private partsRead = false
  /**
   * Whether the handler wrote the response itself.
   * @internal
   */
  takenOver = false
  /**
   * The status of the response, once it is known: after the handler, response
   * validation and error mapping. `undefined` before that. Read it in an
   * `onFinish` callback to learn the final status, including the status an
   * error was mapped to.
   */
  responseStatus: number | undefined = undefined
  /** @internal */
  responseHeaders: ResponseHeaders | null = null
  /**
   * The serialised cookies, by what makes two of them the same cookie.
   * @internal
   */
  responseCookies: Map<string, string> | null = null
  /**
   * The neighbours in the list of requests that hold something to release.
   * @internal
   */
  previousLive: RequestContext | null = null
  /** @internal */
  nextLive: RequestContext | null = null

  constructor(
    private readonly input: RouteInput,
    public readonly route: RouteInfo,
    private readonly host: RequestHost,
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

  /**
   * The path of the request, as the route matched it: fixed text as declared
   * and the url params in between, percent-encoded where they have to be.
   * Whatever the request target looked like, one path has one form here.
   */
  get path(): string {
    return this.host.path(this.input.urlParams)
  }

  /**
   * The url of the request. Its path is `path`; the host is what the client
   * says, or `localhost` when it does not name a valid one.
   */
  get url(): URL {
    if (this.parsedUrl === null) {
      const url = parseUrl(this.input.url())
      url.pathname = this.path
      url.hash = ''
      this.parsedUrl = url
    }
    return this.parsedUrl
  }

  /**
   * The address of the client, as the adapter knows it. Behind a proxy it is
   * the proxy's, unless the adapter is told to trust it. `undefined` when
   * there is no connection, as in a test.
   */
  get ip(): string | undefined {
    return this.input.remoteAddress()
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
        setHeader((this.responseHeaders ??= {}), name, value)
      },
      append: (name, value) => {
        appendHeader((this.responseHeaders ??= {}), name, value)
      },
      cookie: (name, value, options) => {
        this.setCookie({ name, value, options })
      },
      deleteCookie: (name, options) => {
        const secure = options?.secure ?? /^__(?:Host|Secure)-/.test(name)
        this.setCookie({
          name,
          value: '',
          options: { ...options, secure, maxAge: 0, expires: new Date(0) },
        })
      },
    })
  }

  private setCookie(cookie: SetCookie): void {
    const text = serializeCookie(cookie)
    ;(this.responseCookies ??= new Map()).set(cookieKey(cookie), text)
  }

  /**
   * Takes back the headers that described the response a failed handler was
   * going to send.
   * @internal
   */
  dropSuccessHeaders(): void {
    const headers = this.responseHeaders
    if (headers !== null) {
      for (const name of Object.keys(headers)) {
        if (describesSuccess(name, headers[name])) {
          delete headers[name]
        }
      }
    }
  }

  /**
   * The bytes of the request body, exactly as they were sent, for example to
   * check the signature of a webhook. Reading them does not keep the body from
   * being decoded, before or after. Only the bytes of a multipart body, which
   * is not kept in one piece, have to be read before it is decoded: in a
   * guard.
   */
  rawBody(): Promise<Uint8Array> {
    let bytes: Promise<Uint8Array>
    try {
      bytes = Promise.resolve(this.bodyBytes())
    } catch (error) {
      bytes = Promise.reject(error)
    }
    bytes.catch(ignore)
    return bytes
  }

  /**
   * The bytes of the request body, read from the adapter once.
   * @internal
   */
  bodyBytes(): MaybePromise<Uint8Array> {
    if (this.partsRead) {
      throw new Error(
        `[Navios] ${this.method} ${this.route.path} has read the parts of its multipart body, so ` +
          `ctx.rawBody() comes too late. Call it before the body is decoded, in a guard.`,
      )
    }
    return (this.bytes ??= this.input.body.bytes())
  }

  /** @internal */
  bodyParts(): ReturnType<BodySource['parts']> {
    const { body } = this.input
    const { bytes } = this
    if (bytes !== null) {
      const contentType = body.contentType ?? ''
      return isPromise(bytes)
        ? bytes.then((read) => readParts(read, contentType))
        : readParts(bytes, contentType)
    }
    this.partsRead = true
    return body.parts()
  }

  /**
   * The decoded request body. Decoded once: an interceptor may call `next()`
   * again.
   * @internal
   */
  readBody(decode: BodyDecoder): unknown {
    if (this.requestBody === UNREAD) {
      this.requestBody = adopt(decode(this as unknown as RequestContext, this.input.body))
    }
    return this.requestBody
  }

  private parseCookies(): Record<string, string> {
    return (this.cookieJar ??= parseCookies(this.input.header('cookie')))
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
    if (value instanceof Promise) {
      // Whoever awaits it sees the rejection. Nobody may.
      value.catch(ignore)
    }
    ;(this.slots ??= new Map()).set(key, value)
    this.disposeLater(provider, value)
    return value
  }

  private disposeLater(provider: RequestValueProvider<unknown>, value: unknown): void {
    if (typeof provider.dispose === 'function') {
      this.hold()
      ;(this.disposers ??= []).push([provider, value])
    }
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
        this.disposeLater(provider, resolved)
        return resolved
      },
    )
    value.catch(ignore)
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
  resolverFor(token: AnyInjectableType): Container | ScopedContainer {
    const { container, onScopedUse } = this.host
    if (this.scope !== null && onScopedUse === null) {
      return this.scope
    }
    if (!needsScope(container, token)) {
      return this.scope ?? container
    }
    onScopedUse?.(token)
    if (this.scope === null) {
      if (this.released) {
        throw new Error(
          '[Navios] Request-scoped services cannot be used: the response has finished, so nothing ' +
            'would dispose them.',
        )
      }
      this.hold()
      this.scope = container.createScope()
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
   * has finished runs at once. What a callback throws is logged.
   */
  onFinish(callback: () => void | Promise<void>): void {
    if (this.released) {
      void this.finishNow(callback)
      return
    }
    this.hold()
    ;(this.finishers ??= []).push(callback)
  }

  private async finishNow(callback: () => void | Promise<void>): Promise<void> {
    try {
      await callback()
    } catch (error) {
      this.logFailure('an onFinish callback', error)
    }
  }

  // --------------------------------------------------------------------------
  // Response bodies
  // --------------------------------------------------------------------------

  /**
   * Makes the request the owner of a lazy body, which is closed when the
   * request is released, or at once when it already has been. A body that is
   * managed already is returned as it is.
   * @internal
   */
  ownBody(body: object): ManagedBody {
    if (body instanceof ManagedBody) {
      return body
    }
    const owned = this.bodies?.find((managed) => managed.body === body)
    if (owned !== undefined) {
      return owned
    }
    const managed = new ManagedBody(
      body,
      new RequestOwner(this as unknown as RequestContext, this.host),
    )
    if (this.released) {
      void managed.close()
    } else {
      this.hold()
      ;(this.bodies ??= []).push(managed)
    }
    return managed
  }

  /**
   * Notes that the handler wrote the response itself, through `raw`. It may
   * go on doing so, so the request is released like any other.
   * @internal
   */
  takeOver(): void {
    this.hold()
    this.takenOver = true
  }

  /**
   * Sets the status of the response. That of a response the handler writes
   * itself is read again when it has finished.
   * @internal
   */
  respondWith(status: number): void {
    this.responseStatus = status
  }

  // --------------------------------------------------------------------------
  // Disposal
  // --------------------------------------------------------------------------

  /** Runs code of the application inside the async context, if there is one. */
  private run<R>(fn: () => R): R {
    return this.host.asyncContext ? runInContext(this as unknown as RequestContext, fn) : fn()
  }

  /** Called before the request acquires anything that has to be released. */
  private hold(): void {
    if (!this.needsRelease) {
      this.host.live.add(this as unknown as RequestContext)
    }
  }

  /**
   * Whether anything has to be released when the response has finished.
   * @internal
   */
  get needsRelease(): boolean {
    return (
      this.scope !== null ||
      this.disposers !== null ||
      this.finishers !== null ||
      this.bodies !== null ||
      this.takenOver
    )
  }

  /**
   * Closes the lazy bodies of the request, runs its `onFinish` callbacks and
   * the `dispose` hooks of computed request values, each in reverse order, and
   * then disposes the DI scope. Never rejects. Calling it again waits for the
   * first call.
   * @internal
   */
  release(): Promise<void> {
    // Adapters call this from an event of the connection. Whoever listens to
    // `ctx.signal` hears of a disconnect first.
    return (this.releasing ??= nextMicrotask.then(() =>
      this.host.asyncContext ? this.run(() => this.releaseSteps()) : this.releaseSteps(),
    ))
  }

  /**
   * Synchronous when there is nothing to wait for: a request that holds only
   * its DI scope, whose services have no asynchronous destroy hooks, needs no
   * promise of its own to be released.
   */
  private releaseSteps(): void | Promise<void> {
    if (this.takenOver) {
      this.responseStatus = this.input.respondedStatus?.()
    }
    if (this.bodies !== null || this.finishers !== null || this.disposers !== null) {
      return this.releaseAll()
    }
    return this.releaseScope()
  }

  private async releaseAll(): Promise<void> {
    // Any of these may start or register more.
    for (;;) {
      const open = this.bodies?.filter((body) => body.isOpen)
      if (open !== undefined && open.length > 0) {
        await closeBodies(open)
        continue
      }
      const finisher = this.finishers?.pop()
      if (finisher !== undefined) {
        try {
          await finisher()
        } catch (error) {
          this.logFailure('an onFinish callback', error)
        }
        continue
      }
      const disposer = this.disposers?.pop()
      if (disposer === undefined) {
        break
      }
      await this.disposeValue(...disposer)
    }
    await this.releaseScope()
  }

  /** Disposes the DI scope, last, and lets go of the request. */
  private releaseScope(): void | Promise<void> {
    const scope = this.scope
    this.scope = null
    this.released = true
    let disposal: Promise<void> | undefined
    try {
      disposal = scope === null ? undefined : disposeScope(scope)
    } catch (error) {
      this.logFailure('the disposal of the request scope', error)
    }
    if (disposal === undefined) {
      this.host.live.delete(this as unknown as RequestContext)
      return
    }
    return disposal.then(
      () => {
        this.host.live.delete(this as unknown as RequestContext)
      },
      (error: unknown) => {
        this.logFailure('the disposal of the request scope', error)
        this.host.live.delete(this as unknown as RequestContext)
      },
    )
  }

  private async disposeValue(
    provider: RequestValueProvider<unknown>,
    value: unknown,
  ): Promise<void> {
    let settled: unknown
    try {
      settled = await value
    } catch {
      // There is no value to dispose.
      return
    }
    try {
      await provider.dispose!(settled, this as unknown as RequestContext)
    } catch (error) {
      this.logFailure(`the dispose hook of ${provider.constructor.name}`, error)
    }
  }

  /** Reports what must not stop the rest of the release. */
  private logFailure(what: string, error: unknown): void {
    try {
      this.host.logger?.error(`Error in ${what} of ${this.method} ${this.route.path}`, error)
    } catch {
      // Nor may a failing logger.
    }
  }
}

RequestContext.prototype.use = function use(
  this: RequestContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  return (this.resolverFor(token).getSync as any)(token, args)
} as ScopedContainer['getSync']

RequestContext.prototype.resolve = function resolve(
  this: RequestContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  const pending: Promise<unknown> = (this.resolverFor(token).get as any)(token, args)
  // A handler that fails while it is under way leaves it behind, and the
  // scope it belongs to is disposed.
  pending.catch(ignore)
  return pending
} as ScopedContainer['get']
