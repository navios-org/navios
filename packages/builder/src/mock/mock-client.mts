import { NaviosError } from '../shared/navios-error.mjs'

import type {
  AbstractRequestConfig,
  AbstractResponse,
  Client,
  ClientRequestContext,
} from '../http/client.mjs'
import type { BaseEndpointOptions } from '../http/endpoint-options.mjs'

import type {
  AnyMockTarget,
  MockCall,
  MockClient,
  MockClientOptions,
  MockContext,
  MockDelay,
  MockHandler,
  MockOptions,
  MockResponse,
  MockResponseInit,
} from './mock-types.mjs'

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  207: 'Multi-Status',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
}

class MockResponseImpl {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly init: MockResponseInit,
  ) {}
}

type AnyHandler = MockHandler<BaseEndpointOptions>

interface Registered {
  handler: AnyHandler
  options: MockOptions
}

interface Mocks {
  persistent?: Registered
  queued: Registered[]
}

function endpointOf(target: AnyMockTarget): BaseEndpointOptions {
  const handler = 'config' in target ? target : target.endpoint
  if (!handler || typeof handler.config !== 'object' || handler.config === null) {
    throw new NaviosError(
      '[Navios-Mock]: a mock target must be an endpoint, or an object with an `endpoint`',
    )
  }
  return handler.config
}

function pickDelay(delay: MockDelay | undefined): number {
  if (delay === undefined) return 0
  if (typeof delay === 'number') return delay
  const [min, max] = delay
  return min + Math.random() * (max - min)
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal))
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal!))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** The status a plain return value is sent with. */
function successStatus(endpoint: BaseEndpointOptions): number {
  if (endpoint.response === 'void') return 204
  const declared = Object.keys(endpoint.responses ?? {})
    .map(Number)
    .filter((status) => status >= 200 && status < 300)
    .sort((a, b) => a - b)
  return declared[0] ?? 200
}

/**
 * A JSON body is copied through `JSON` the way the wire would carry it, so a
 * mock cannot hand the app a value no server could send (a `Date`, a `Map`)
 * nor share an object with the cache.
 */
function wireBody(endpoint: BaseEndpointOptions, body: unknown): unknown {
  const json = (endpoint.response ?? 'json') === 'json'
  if (!json || body === undefined) return body
  return JSON.parse(JSON.stringify(body))
}

/**
 * Creates a client that answers calls by endpoint, for tests and for
 * building a UI before its backend exists.
 *
 * Mocks are registered per endpoint and matched by identity, not by URL, so
 * `/users/$id` and `/users/me` never shadow each other. What a mock returns
 * goes through the endpoint's whole pipeline: it is validated with the
 * endpoint's schemas, so a mock cannot drift from the contract unnoticed.
 *
 * @example
 * ```ts
 * import { createMockClient } from '@navios/builder/mock'
 *
 * export const mocks = createMockClient({ delay: [100, 400] })
 *
 * mocks.on(getUser, ({ urlParams }) => ({ id: String(urlParams.userId), name: 'Ada' }))
 * mocks.on(deleteUser, (_, { respond }) => respond(403, { message: 'Not yours' }))
 *
 * // At start-up: mocked endpoints are answered here, everything else by axios
 * api.provideClient(mocks.wrap(axios.create({ baseURL: '/api/' })))
 * ```
 */
export function createMockClient(options: MockClientOptions = {}): MockClient {
  const registry = new Map<BaseEndpointOptions, Mocks>()
  const recorded: MockCall[] = []

  function register(target: AnyMockTarget, entry: Registered, once: boolean) {
    const endpoint = endpointOf(target)
    let mocks = registry.get(endpoint)
    if (!mocks) {
      mocks = { queued: [] }
      registry.set(endpoint, mocks)
    }
    if (once) mocks.queued.push(entry)
    else mocks.persistent = entry
    return { endpoint, mocks }
  }

  /** Takes the mock that answers the next call of `endpoint`, if any. */
  function take(endpoint: BaseEndpointOptions): Registered | undefined {
    const mocks = registry.get(endpoint)
    if (!mocks) return undefined
    return mocks.queued.shift() ?? mocks.persistent
  }

  async function answer(
    entry: Registered,
    config: AbstractRequestConfig,
    context: ClientRequestContext,
  ): Promise<AbstractResponse<unknown>> {
    const { endpoint, args } = context
    const signal = config.signal ?? args.signal ?? undefined
    recorded.push({ endpoint, args: args as never, request: config })

    const mockContext: MockContext<BaseEndpointOptions> = {
      respond: ((status: number, body?: unknown, init: MockResponseInit = {}) =>
        new MockResponseImpl(status, body, init) as unknown as MockResponse) as never,
      request: config,
      signal,
    }

    await wait(pickDelay(entry.options.delay ?? options.delay), signal)
    const result = await entry.handler(args as never, mockContext)
    if (signal?.aborted) throw abortError(signal)

    if (result instanceof MockResponseImpl) {
      return {
        status: result.status,
        statusText: result.init.statusText ?? STATUS_TEXT[result.status] ?? '',
        headers: { ...result.init.headers },
        data: wireBody(endpoint, result.body),
      }
    }
    const status = successStatus(endpoint)
    return {
      status,
      statusText: STATUS_TEXT[status] ?? '',
      headers: {},
      data: wireBody(endpoint, result),
    }
  }

  function clientWith(fallback: Client | undefined): Client['request'] {
    return (async (config: AbstractRequestConfig, context?: ClientRequestContext) => {
      const entry = context ? take(context.endpoint) : undefined
      if (entry && context) {
        return answer(entry, config, context)
      }
      if (fallback) {
        return fallback.request(config, context)
      }
      const declared = context
        ? ` (declared as ${context.endpoint.method} ${context.endpoint.url})`
        : ''
      throw new NaviosError(
        `[Navios-Mock]: no mock answers ${config.method ?? 'GET'} ${config.url}${declared}, and there is no fallback client`,
      )
    }) as Client['request']
  }

  const client: MockClient = {
    request: clientWith(options.fallback),

    on(target, handler, mockOptions = {}) {
      const entry = { handler: handler as unknown as AnyHandler, options: mockOptions }
      const { mocks } = register(target as never, entry, false)
      return () => {
        if (mocks.persistent === entry) mocks.persistent = undefined
      }
    },

    once(target, handler, mockOptions = {}) {
      register(
        target as never,
        { handler: handler as unknown as AnyHandler, options: mockOptions },
        true,
      )
    },

    off(target) {
      registry.delete(endpointOf(target))
    },

    has(target) {
      const mocks = registry.get(endpointOf(target))
      return Boolean(mocks && (mocks.persistent || mocks.queued.length > 0))
    },

    calls(target?: AnyMockTarget) {
      if (!target) return [...recorded]
      const endpoint = endpointOf(target)
      return recorded.filter((call) => call.endpoint === endpoint)
    },

    reset() {
      registry.clear()
      recorded.length = 0
    },

    wrap(fallback) {
      return { request: clientWith(fallback) }
    },
  } as MockClient

  return client
}
