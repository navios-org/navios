import type { AbstractRequestConfig, Client } from '../http/client.mjs'
import type { EndpointHandler, InferWireBody, NonJsonBody } from '../http/endpoint-handler.mjs'
import type { BaseEndpointOptions, SuccessSchemaRecord } from '../http/endpoint-options.mjs'
import type { ErrorSchemaRecord } from '../http/error-schema.mjs'
import type { ClientRequestArgs } from '../http/request-args.mjs'
import type { InferSchemaInput, Schema } from '../shared/schema.mjs'

/**
 * What a mock can be registered for: an endpoint handler, or anything that
 * carries one as `endpoint` (the query, infinite query and mutation objects
 * of `@navios/react-query`).
 */
export type MockTarget<Options extends BaseEndpointOptions> =
  | EndpointHandler<Options>
  | { readonly endpoint: EndpointHandler<Options> }

/** Any mock target, whatever its endpoint's options: for lookups that need no types. */
export type AnyMockTarget =
  | { readonly config: BaseEndpointOptions }
  | { readonly endpoint: { readonly config: BaseEndpointOptions } }

/** Latency of a mocked response in milliseconds, or a `[min, max]` range. */
export type MockDelay = number | readonly [min: number, max: number]

/**
 * The body a mock returns for a successful call: what the server would send,
 * that is the input of the endpoint's schema. It is validated like a real
 * response.
 */
export type MockSuccessBody<Options extends BaseEndpointOptions> = NonJsonBody<
  Options,
  InferWireBody<Options>,
  void | undefined
>

/** The body `respond(status, body)` takes for one status of an endpoint. */
export type MockBodyFor<
  Options extends BaseEndpointOptions,
  Status extends number,
> = Options['errorSchema'] extends ErrorSchemaRecord
  ? Status extends keyof Options['errorSchema']
    ? InferSchemaInput<Options['errorSchema'][Status]>
    : MockDeclaredBody<Options, Status>
  : MockDeclaredBody<Options, Status>

type MockDeclaredBody<
  Options extends BaseEndpointOptions,
  Status extends number,
> = Options['responses'] extends SuccessSchemaRecord
  ? Status extends keyof Options['responses']
    ? Options['responses'][Status] extends Schema
      ? InferSchemaInput<Options['responses'][Status]>
      : undefined
    : unknown
  : `${Status}` extends `2${string}`
    ? MockSuccessBody<Options>
    : unknown

/** Options of one mocked response. */
export interface MockResponseInit {
  /** Response headers, e.g. `content-disposition` for a download. */
  headers?: Record<string, string>
  /** Status text. Defaults to the usual text of the status, when there is one. */
  statusText?: string
}

declare const mockResponseBrand: unique symbol

/**
 * A response described by `respond(...)`. Return it from a mock to choose
 * the status and the headers.
 */
export interface MockResponse {
  readonly [mockResponseBrand]: true
  readonly status: number
  readonly body: unknown
  readonly init: MockResponseInit
}

/** The second argument of a mock handler. */
export interface MockContext<Options extends BaseEndpointOptions> {
  /**
   * Describes a response with any status. The body is typed by the
   * endpoint's `errorSchema` or `responses` entry for that status.
   *
   * @example
   * ```ts
   * mocks.on(getUser, (_, { respond }) => respond(404, { message: 'No such user' }))
   * ```
   */
  respond: <const Status extends number>(
    status: Status,
    ...rest: undefined extends MockBodyFor<Options, Status>
      ? [body?: MockBodyFor<Options, Status>, init?: MockResponseInit]
      : [body: MockBodyFor<Options, Status>, init?: MockResponseInit]
  ) => MockResponse
  /** The request config the builder built: bound URL, query, body, headers. */
  request: AbstractRequestConfig
  /** The call's abort signal, when it has one. */
  signal: AbortSignal | undefined
}

/**
 * Answers one call of a mocked endpoint. Return the body, or `respond(...)`
 * for another status or for headers. Throw to fail the call as a network
 * failure would.
 */
export type MockHandler<Options extends BaseEndpointOptions> = (
  args: ClientRequestArgs<Options>,
  context: MockContext<Options>,
) => MockSuccessBody<Options> | MockResponse | Promise<MockSuccessBody<Options> | MockResponse>

/** Options of one mock. */
export interface MockOptions {
  /** Latency for this mock; wins over the client's `delay`. */
  delay?: MockDelay
}

/** One call a mock client saw. */
export interface MockCall<Options extends BaseEndpointOptions = BaseEndpointOptions> {
  /** The declaration of the endpoint that was called. */
  endpoint: Options
  /** The call's arguments, as the caller passed them. */
  args: ClientRequestArgs<Options>
  /** The request config the builder built. */
  request: AbstractRequestConfig
}

/** Options of {@link createMockClient}. */
export interface MockClientOptions {
  /**
   * Client for every request no mock answers, such as the real HTTP client
   * while only part of an API is mocked. Without one such a request fails.
   * `wrap(client)` gives the same registry another fallback.
   */
  fallback?: Client
  /**
   * Latency of every mocked response, in milliseconds or as a `[min, max]`
   * range. Lets loading states show while developing against mocks.
   *
   * @default 0
   */
  delay?: MockDelay
}

/**
 * A {@link Client} that answers calls of the endpoints it has mocks for.
 */
export interface MockClient extends Client {
  /**
   * Answers every call of `target` with `handler`, replacing a mock the
   * endpoint already has. Returns a function that removes it.
   */
  on<Options extends BaseEndpointOptions>(
    target: MockTarget<Options>,
    handler: MockHandler<Options>,
    options?: MockOptions,
  ): () => void

  /**
   * Answers the next call of `target` only. Calls queued with `once` are
   * answered in order, before the endpoint's `on` mock.
   */
  once<Options extends BaseEndpointOptions>(
    target: MockTarget<Options>,
    handler: MockHandler<Options>,
    options?: MockOptions,
  ): void

  /** Removes the mocks of `target`, so its calls go to the fallback again. */
  off(target: AnyMockTarget): void

  /** Whether `target` has a mock. */
  has(target: AnyMockTarget): boolean

  /** The calls mocks answered, oldest first; only those of `target` when given. */
  calls<Options extends BaseEndpointOptions>(target: MockTarget<Options>): MockCall<Options>[]
  calls(): MockCall[]

  /** Removes every mock and forgets every call. */
  reset(): void

  /**
   * A client that answers from these mocks and sends everything else
   * through `client`. Use it where the real client is created after the
   * mocks were declared.
   *
   * @example
   * ```ts
   * api.provideClient(mocks.wrap(axios.create({ baseURL: '/api/' })))
   * ```
   */
  wrap(client: Client): Client
}
