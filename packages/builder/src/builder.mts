import { NaviosError } from './errors/index.mjs'
import { createEndpoint, createMultipart, createStream } from './handlers/index.mjs'

import type {
  BaseEndpointOptions,
  BuilderConfig,
  BuilderInstance,
  Client,
  EndpointOptions,
} from './types/index.mjs'

/**
 * Creates a new API builder instance with the specified configuration.
 *
 * The builder allows you to declaratively define API endpoints with type-safe
 * request and response schemas using Zod. It supports envelope-mode responses,
 * error handling callbacks, and various HTTP methods.
 *
 * @param config - Configuration options for the builder
 * @param config.onError - Optional callback function that will be called when
 *   any error occurs during a request. This is called before the error is thrown
 *   or processed.
 * @param config.onZodError - Optional callback function that will be called when
 *   a Zod validation error occurs. This is called after `onError` if provided.
 *   Useful for logging validation errors or showing user-friendly messages.
 * @param config.defaults - Default behaviour applied to every endpoint declaration
 *   unless overridden per-endpoint (e.g. `defaults: { result: 'envelope' }`).
 *
 * @returns A BuilderInstance with methods to declare endpoints and manage the HTTP client
 *
 * @example
 * ```ts
 * // Default mode: errors are thrown, return type is the success response
 * const API = builder()
 *
 * // Envelope-by-default
 * const API = builder({
 *   defaults: { result: 'envelope' },
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

  const context = { getClient, config }

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

  // The implementation uses BaseEndpointOptions/EndpointOptions internally.
  // TypeScript's const generic inference happens at the call site, and the runtime
  // behavior is identical. We use type assertions here because:
  // 1. The runtime implementation handles all schema combinations correctly
  // 2. The type inference happens through the BuilderInstance interface
  // 3. The handler functions already handle optional schemas via conditional logic
  return {
    declareEndpoint: (options: EndpointOptions) => createEndpoint(options, context),
    declareStream: (options: BaseEndpointOptions) => createStream(options, context),
    declareMultipart: (options: EndpointOptions) => createMultipart(options, context),
    provideClient,
    getClient,
  } as BuilderInstance
}
