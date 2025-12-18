import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  BuilderConfig,
  BuilderInstance,
  Client,
} from './types/index.mjs'

import { NaviosError } from './errors/index.mjs'
import { createEndpoint, createMultipart, createStream } from './handlers/index.mjs'

/**
 * Creates a new API builder instance with the specified configuration.
 *
 * The builder allows you to declaratively define API endpoints with type-safe
 * request and response schemas using Zod. It supports discriminated unions for
 * handling different response types, error handling callbacks, and various
 * HTTP methods.
 *
 * @param config - Configuration options for the builder
 * @param config.useDiscriminatorResponse - If `true`, error responses will be
 *   parsed using the same responseSchema as success responses. This is useful
 *   when your API returns discriminated unions that include both success and
 *   error cases. Default is `false`.
 * @param config.onError - Optional callback function that will be called when
 *   any error occurs during a request. This is called before the error is thrown
 *   or processed.
 * @param config.onZodError - Optional callback function that will be called when
 *   a Zod validation error occurs. This is called after `onError` if provided.
 *   Useful for logging validation errors or showing user-friendly messages.
 *
 * @returns A BuilderInstance with methods to declare endpoints and manage the HTTP client
 *
 * @example
 * ```ts
 * const API = builder({
 *   useDiscriminatorResponse: true,
 *   onError: (error) => console.error('Request failed:', error),
 *   onZodError: (error, response) => {
 *     console.error('Validation failed:', error.errors)
 *   }
 * })
 * ```
 */
export function builder(config: BuilderConfig = {}): BuilderInstance {
  let client: Client | null = null

  /**
   * Gets the current HTTP client instance.
   *
   * @returns The configured HTTP client
   * @throws {NaviosError} If no client has been provided via `provideClient`
   */
  function getClient() {
    if (!client) {
      throw new NaviosError('[Navios-API]: Client was not provided')
    }
    return client
  }

  /**
   * Declares a new API endpoint with request/response validation.
   *
   * @param options - Endpoint configuration
   * @returns A function that makes the HTTP request and returns validated response data
   */
  function declareEndpoint(options: BaseEndpointConfig) {
    return createEndpoint(options, {
      getClient,
      config,
    })
  }

  /**
   * Declares a new stream endpoint for downloading files as Blob.
   *
   * @param options - Stream endpoint configuration
   * @returns A function that makes the HTTP request and returns a Blob
   */
  function declareStream(options: BaseStreamConfig) {
    return createStream(options, {
      getClient,
      config,
    })
  }

  /**
   * Declares a new multipart/form-data endpoint for file uploads.
   *
   * The request data will be automatically converted to FormData.
   *
   * @param options - Multipart endpoint configuration
   * @returns A function that makes the HTTP request with FormData and returns validated response data
   */
  function declareMultipart(options: BaseEndpointConfig) {
    return createMultipart(options, {
      getClient,
      config,
    })
  }

  /**
   * Sets or replaces the HTTP client instance used by all endpoints.
   *
   * The client must implement the `Client` interface with a `request` method.
   * Compatible with axios, @navios/http, and any client that follows the same interface.
   *
   * @param newClient - The HTTP client instance to use for all requests
   *
   * @example
   * ```ts
   * import { create } from '@navios/http'
   * const client = create({ baseURL: 'https://api.example.com' })
   * API.provideClient(client)
   * ```
   */
  function provideClient(newClient: Client) {
    client = newClient
  }

  return {
    declareEndpoint,
    declareStream,
    declareMultipart,
    provideClient,
    getClient,
  }
}
