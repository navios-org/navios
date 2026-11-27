// What the socket and the EventSource builders share: their error type, the
// registry of subscribers, validated delivery and opening a connection.

import { appendQuery } from './append-query.mjs'
import { bindUrlParams, getUrlParamNames } from './bind-url-params.mjs'
import { callErrorHook } from './call-error-hook.mjs'
import { dispatch } from './dispatch.mjs'
import { getOrCreate } from './get-or-create.mjs'
import { NaviosError } from './navios-error.mjs'
import { toSchemaIssue } from './schema.mjs'
import { isPendingOutcome, validateQuerySync, validateSync } from './validate.mjs'

import type { Schema, SchemaIssue, StandardIssue } from './schema.mjs'
import type { Simplify } from './type-helpers.mjs'
import type { ValidationOutcome } from './validate.mjs'

// =============================================================================
// Errors
// =============================================================================

/** What `SocketError` and `EventSourceError` are made of, besides what failed. */
export interface RealtimeErrorFields<Kind extends string> {
  kind: Kind
  message?: string
  url?: string
  issues?: readonly StandardIssue[]
  rawData?: unknown
  cause?: unknown
}

/**
 * The base of `SocketError` and `EventSourceError`. `Subject` is the field that
 * names what the failure belongs to: `{ topic }` or `{ eventName }`.
 */
export abstract class RealtimeError<
  Kind extends string,
  Subject extends object,
> extends NaviosError {
  readonly kind: Kind
  /** URL of the connection, when the client exposes one. */
  declare readonly url?: string
  /** Validation issues, for `validation`. */
  declare readonly issues?: readonly SchemaIssue[]
  /** The value that failed validation or parsing, exactly as it was received or passed. */
  declare readonly rawData?: unknown

  constructor(name: string, message: string, init: RealtimeErrorFields<Kind>) {
    super(message, { cause: init.cause })
    this.name = name
    this.kind = init.kind
    if (init.url !== undefined) this.url = init.url
    if (init.issues !== undefined) this.issues = init.issues.map(toSchemaIssue)
    if ('rawData' in init) this.rawData = init.rawData
  }

  /**
   * Creates an error and passes it to the `onError` hook. The hook is for
   * telemetry: an exception thrown inside it is caught and logged, so it can
   * never break message handling.
   *
   * @internal
   */
  static report<Init, E extends RealtimeError<string, object>>(
    this: new (init: Init) => E,
    onError: ((error: E) => void) | undefined,
    init: Init,
  ): E {
    const error = new this(init)
    // `Navios-Socket` for a `SocketError`, `Navios-EventSource` for an `EventSourceError`
    callErrorHook(onError, `Navios-${error.name.replace(/Error$/, '')}`, error)
    return error
  }

  /** The field that names what failed, as `toJSON()` lists it. */
  protected abstract subject(): Subject

  /**
   * Plain-object form without `cause`. Safe to hand to loggers and
   * `JSON.stringify` as long as `rawData` itself is serializable.
   */
  toJSON(): Simplify<
    { name: string; message: string; kind: Kind } & Subject & {
        url?: string
        issues?: readonly SchemaIssue[]
        rawData?: unknown
      }
  > {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      ...this.subject(),
      ...(this.url !== undefined ? { url: this.url } : {}),
      ...(this.issues !== undefined ? { issues: this.issues } : {}),
      ...('rawData' in this ? { rawData: this.rawData } : {}),
    } as never
  }
}

// =============================================================================
// Subscribers
// =============================================================================

/**
 * Listeners by event name. An event whose last listener leaves is forgotten,
 * so a registry that sees one event per acknowledgement does not grow.
 */
export class Listeners<L> {
  private readonly byEvent = new Map<string, Set<L>>()

  add(event: string, listener: L): void {
    getOrCreate(this.byEvent, event, () => new Set()).add(listener)
  }

  /**
   * Removes one listener of the event, or all of them.
   *
   * @returns Whether the event lost its last listener
   */
  remove(event: string, listener?: L): boolean {
    const listeners = this.byEvent.get(event)
    if (!listeners) return false
    if (listener !== undefined && (!listeners.delete(listener) || listeners.size > 0)) return false
    this.byEvent.delete(event)
    return true
  }

  /** The events that have listeners. */
  events(): IterableIterator<string> {
    return this.byEvent.keys()
  }

  /** How many events have listeners. */
  get size(): number {
    return this.byEvent.size
  }

  clear(): void {
    this.byEvent.clear()
  }

  /** Calls the listeners of an event, as {@link dispatch} does. */
  emit(event: string, call: (listener: L) => void): void {
    dispatch(() => this.byEvent.get(event), call)
  }
}

/** Why a subscriber did not get a message: it was invalid, or the subscriber threw. */
export type SubscriberFailure = { url: string | undefined } & (
  | { kind: 'validation'; issues: readonly StandardIssue[]; rawData: unknown; cause: unknown }
  | { kind: 'transport'; cause: unknown }
)

export interface SubscribeOptions<Args extends unknown[]> {
  /** Validates a message; without it the first argument is delivered as it is. */
  validate: ((...args: Args) => ValidationOutcome | Promise<ValidationOutcome>) | undefined
  /** URL of the connection the message arrived on. */
  url: () => string | undefined
  /** Reports a failure to the `onError` hook. */
  report: (failure: SubscriberFailure) => void
  /** Listens to the client for the event, once the subscriber is registered. */
  listen: () => void
  /** Stops listening, once the event has no subscribers left. */
  unlisten: () => void
}

/**
 * Subscribes `handler` to an event: what arrives is validated and the handler
 * receives the output. An invalid message and a handler that throws are
 * reported instead; the listener never throws.
 *
 * A synchronous schema delivers within the same tick. An asynchronous one is
 * awaited first, unless the handler unsubscribed in the meantime.
 *
 * @returns The function that unsubscribes
 */
export function subscribeValidated<Args extends [data: unknown, ...rest: unknown[]]>(
  listeners: Listeners<(...args: Args) => void>,
  event: string,
  handler: (payload: unknown) => void,
  { validate, url, report, listen, unlisten }: SubscribeOptions<Args>,
): () => void {
  let subscribed = true

  const listener = (...args: Args) => {
    const at = url()

    const deliver = (outcome: ValidationOutcome) => {
      if (!outcome.ok) {
        report({
          kind: 'validation',
          url: at,
          issues: outcome.issues,
          rawData: args[0],
          cause: outcome.cause,
        })
        return
      }
      try {
        handler(outcome.value)
      } catch (cause) {
        report({ kind: 'transport', url: at, cause })
      }
    }

    const outcome = validate ? validate(...args) : { ok: true as const, value: args[0] }
    if (isPendingOutcome(outcome)) {
      void outcome.then((resolved) => {
        if (subscribed) deliver(resolved)
      })
    } else {
      deliver(outcome)
    }
  }

  listeners.add(event, listener)
  listen()

  return () => {
    subscribed = false
    if (listeners.remove(event, listener)) unlisten()
  }
}

/** Options of `provideClient` on the socket and EventSource builders. */
export interface ProvideClientOptions {
  /** Close the client that is replaced. It is left open by default. */
  closePrevious?: boolean
}

// =============================================================================
// Connections
// =============================================================================

/** What a `declareWebSocket` / `declareEventSource` declaration says about its URL. */
export interface ConnectionOptions {
  url: string
  querySchema?: Schema
  urlParamsSchema?: Schema
}

/** The parameters of one connection, as the runtime sees them. */
interface ConnectParams {
  urlParams?: Record<string, unknown>
  params?: Record<string, unknown>
}

/**
 * Why a connection was not opened. The kinds are those of an `EndpointError`
 * for a call that was not sent.
 *
 * - `request-validation` — `urlParamsSchema` or `querySchema` rejected the
 *   arguments. `issues` is set.
 * - `config` — the connection could not be opened: a URL parameter is missing
 *   or cannot be part of a URL, a schema validates asynchronously, or the
 *   runtime has no `WebSocket` / `EventSource` class.
 */
export type ConnectionErrorKind = 'config' | 'request-validation'

/** The part of a connection's arguments a validation issue belongs to. */
export type ConnectionPart = 'urlParams' | 'params'

/** A validation issue of a {@link ConnectionError}. `path` starts inside `part`. */
export interface ConnectionIssue extends SchemaIssue {
  readonly part: ConnectionPart
}

export interface ConnectionErrorInit {
  kind: ConnectionErrorKind
  /** URL template of the declaration. */
  url: string
  message?: string
  issues?: readonly (StandardIssue & { part: ConnectionPart })[]
  cause?: unknown
}

/**
 * Thrown by the function `declareWebSocket` or `declareEventSource` returns
 * when a connection cannot be opened with the arguments it was called with.
 * Nothing was opened. Discriminate on `error.kind`.
 */
export class ConnectionError extends NaviosError {
  readonly kind: ConnectionErrorKind
  /** URL template of the declaration. */
  readonly url: string
  /** Validation issues, for `request-validation`. */
  declare readonly issues?: readonly ConnectionIssue[]

  constructor(init: ConnectionErrorInit) {
    super(
      init.message ??
        (init.kind === 'request-validation'
          ? `Connection to ${init.url} was not opened: validation of its arguments failed`
          : `Connection to ${init.url} could not be opened`),
      { cause: init.cause },
    )
    this.name = 'ConnectionError'
    this.kind = init.kind
    this.url = init.url
    if (init.issues !== undefined) {
      this.issues = init.issues.map((issue) => ({ ...toSchemaIssue(issue), part: issue.part }))
    }
  }

  /** Plain-object form without `cause`. Safe to hand to loggers and `JSON.stringify`. */
  toJSON(): {
    name: string
    message: string
    kind: ConnectionErrorKind
    url: string
    issues?: readonly ConnectionIssue[]
  } {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      url: this.url,
      ...(this.issues !== undefined ? { issues: this.issues } : {}),
    }
  }
}

/**
 * Type guard for {@link ConnectionError}. Use it in a `catch` block, where the
 * caught value is `unknown`.
 */
export function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError
}

/**
 * Only a scheme makes a URL absolute. `//host/path` does not: a doubled slash
 * in a path must not open the connection on another host.
 */
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i

/** Joins the base URL and a URL with exactly one slash, as `@navios/http` does. */
function joinUrl(baseURL: string | undefined, url: string): string {
  if (!baseURL || ABSOLUTE_URL.test(url)) return url
  return url ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : baseURL
}

/**
 * The function `declareWebSocket` and `declareEventSource` return, with the
 * declaration attached as `config`. Each call opens a connection with the
 * runtime's class, at the base URL joined with the URL template, its
 * parameters bound, and the validated query.
 *
 * @param runtimeClass - The class connections are opened with, looked up for every call
 * @param missing - The message of what is thrown when there is none
 * @param open - Opens the connection
 * @throws {ConnectionError} when the arguments are invalid or there is no class
 */
export function declareConnection<Options extends ConnectionOptions, Class, Handle>(
  options: Options,
  baseURL: string | undefined,
  runtimeClass: () => Class | undefined,
  missing: string,
  open: (connectionClass: Class, url: string) => Handle,
): ((params?: ConnectParams) => Handle) & { config: Options } {
  const { url, urlParamsSchema, querySchema } = options
  const hasUrlParams = getUrlParamNames(url).length > 0
  const config = (message: string | undefined, cause?: unknown) =>
    new ConnectionError({ kind: 'config', url, message, cause })

  const connect = (params: ConnectParams = {}) => {
    const connectionClass = runtimeClass()
    if (!connectionClass) {
      throw config(missing)
    }

    let { urlParams } = params
    let query: Record<string, unknown> | undefined
    const invalid: (Extract<ValidationOutcome, { ok: false }> & { part: ConnectionPart })[] = []
    try {
      // Without `urlParams` there is nothing to validate: binding reports them missing
      if (urlParamsSchema && hasUrlParams && urlParams) {
        const outcome = validateSync(urlParamsSchema, urlParams)
        if (outcome.ok) urlParams = outcome.value as Record<string, unknown>
        else invalid.push({ part: 'urlParams', ...outcome })
      }
      // The query is validated also when it is left out, so that its defaults and
      // required fields apply
      if (querySchema) {
        const outcome = validateQuerySync(querySchema, params.params)
        if (outcome.ok) query = outcome.value as Record<string, unknown> | undefined
        else invalid.push({ part: 'params', ...outcome })
      }
    } catch (cause) {
      // A schema that validates asynchronously
      throw config(cause instanceof Error ? `${url}: ${cause.message}` : undefined, cause)
    }
    if (invalid.length > 0) {
      throw new ConnectionError({
        kind: 'request-validation',
        url,
        issues: invalid.flatMap(({ part, issues }) =>
          issues.map(({ message, path }) => ({ message, path, part })),
        ),
        cause: invalid[0]!.cause,
      })
    }

    let urlPart: string
    try {
      urlPart = bindUrlParams(url, { urlParams })
    } catch (cause) {
      throw config(cause instanceof Error ? `${url}: ${cause.message}` : undefined, cause)
    }
    return open(connectionClass, appendQuery(joinUrl(baseURL, urlPart), query))
  }
  return Object.assign(connect, { config: options })
}
