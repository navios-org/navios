import type { AbstractRequestConfig, AbstractResponse, Client } from '../../types/index.mjs'

/**
 * Mock response configuration for a specific endpoint.
 */
export interface MockResponse {
  status: number
  data: unknown
  headers?: Record<string, string>
  statusText?: string
}

/**
 * Options for creating a mock client.
 */
export interface MockClientOptions {
  /**
   * Map of responses keyed by "METHOD:URL" pattern.
   * @example
   * ```ts
   * new Map([
   *   ['GET:/users/123', { status: 200, data: { id: '123', name: 'John' } }],
   *   ['POST:/users', { status: 201, data: { id: '456' } }],
   * ])
   * ```
   */
  responses?: Map<string, MockResponse>

  /**
   * Default response to return when no matching response is found.
   */
  defaultResponse?: MockResponse

  /**
   * Simulated network delay in milliseconds.
   */
  delay?: number

  /**
   * If true, all requests will fail with a network error.
   */
  shouldFail?: boolean

  /**
   * Custom error to throw when shouldFail is true.
   */
  failWith?: Error
}

/**
 * Extended client interface with test utilities.
 */
export interface MockClient extends Client {
  /**
   * Array of all request configs that were made.
   */
  calls: AbstractRequestConfig[]

  /**
   * Get the last request config that was made.
   */
  getLastCall: () => AbstractRequestConfig | undefined

  /**
   * Get a specific call by index.
   */
  getCall: (index: number) => AbstractRequestConfig | undefined

  /**
   * Reset all recorded calls.
   */
  reset: () => void

  /**
   * Add or update a mock response.
   */
  mockResponse: (method: string, url: string, response: MockResponse) => void

  /**
   * Remove a mock response.
   */
  clearResponse: (method: string, url: string) => void

  /**
   * Set the default response.
   */
  setDefaultResponse: (response: MockResponse | undefined) => void

  /**
   * Enable/disable network failure simulation.
   */
  setFailure: (shouldFail: boolean, error?: Error) => void
}

/**
 * Creates a mock HTTP client for testing.
 *
 * @example
 * ```ts
 * const mockClient = createMockClient({
 *   responses: new Map([
 *     ['GET:/users/123', { status: 200, data: { id: '123', name: 'John' } }],
 *   ]),
 * })
 *
 * const api = builder()
 * api.provideClient(mockClient)
 *
 * const getUser = api.declareEndpoint({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: userSchema,
 * })
 *
 * const user = await getUser({ urlParams: { userId: '123' } })
 * expect(user).toEqual({ id: '123', name: 'John' })
 * expect(mockClient.getLastCall()?.url).toBe('/users/123')
 * ```
 */
export function createMockClient(options: MockClientOptions = {}): MockClient {
  const calls: AbstractRequestConfig[] = []
  const responses = options.responses ?? new Map<string, MockResponse>()
  let defaultResponse = options.defaultResponse
  let delay = options.delay ?? 0
  let shouldFail = options.shouldFail ?? false
  let failWith = options.failWith

  const client: MockClient = {
    calls,

    getLastCall: () => calls[calls.length - 1],

    getCall: (index: number) => calls[index],

    reset: () => {
      calls.length = 0
    },

    mockResponse: (method: string, url: string, response: MockResponse) => {
      responses.set(`${method}:${url}`, response)
    },

    clearResponse: (method: string, url: string) => {
      responses.delete(`${method}:${url}`)
    },

    setDefaultResponse: (response: MockResponse | undefined) => {
      defaultResponse = response
    },

    setFailure: (fail: boolean, error?: Error) => {
      shouldFail = fail
      failWith = error
    },

    async request<T = unknown>(config: AbstractRequestConfig): Promise<AbstractResponse<T>> {
      // Record the call
      calls.push(config)

      // Simulate network delay
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      // Simulate network failure
      if (shouldFail) {
        throw failWith ?? new Error('Mock network error')
      }

      // Find matching response
      const key = `${config.method}:${config.url}`
      const response = responses.get(key) ?? defaultResponse

      if (!response) {
        throw new Error(
          `No mock response configured for ${key}. ` +
            `Configure with mockResponse() or set a defaultResponse.`,
        )
      }

      // Simulate error responses (status >= 400)
      if (response.status >= 400) {
        const error = new Error(`Request failed with status ${response.status}`) as Error & {
          response: AbstractResponse<unknown>
        }
        error.response = {
          data: response.data,
          status: response.status,
          statusText: response.statusText ?? 'Error',
          headers: response.headers ?? {},
        }
        throw error
      }

      // Return success response
      return {
        data: response.data as T,
        status: response.status,
        statusText: response.statusText ?? 'OK',
        headers: response.headers ?? {},
      }
    },
  }

  return client
}

/**
 * Helper to create a success response.
 */
export function successResponse<T>(data: T, status = 200): MockResponse {
  return { status, data }
}

/**
 * Helper to create an error response.
 */
export function errorResponse<T>(data: T, status: number): MockResponse {
  return { status, data }
}
