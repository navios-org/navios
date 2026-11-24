import { NaviosError } from './errors/index.mjs'
import { createHandler } from './handlers/index.mjs'

import type { BaseEndpointOptions, BuilderConfig, BuilderInstance, Client } from './types/index.mjs'

/**
 * Creates a new API builder instance.
 *
 * The builder declares API endpoints with type-safe request and response
 * schemas using Zod. Every endpoint can be called in two ways: `endpoint(args)`
 * throws an `EndpointError` on failure, `endpoint.safe(args)` returns a
 * `SafeResult` and never throws.
 *
 * @param config - Configuration options for the builder
 * @param config.client - HTTP client used by every endpoint
 * @param config.onError - Telemetry hook, called once per failed call with the
 *   `EndpointError` the caller receives
 *
 * @example
 * ```ts
 * import { create } from '@navios/http'
 *
 * const api = builder({
 *   client: create({ baseURL: 'https://api.example.com' }),
 *   onError: (error) => {
 *     console.error(error.kind, error.endpoint.method, error.endpoint.url)
 *   },
 * })
 * ```
 */
export function builder(config: BuilderConfig = {}): BuilderInstance {
  let client: Client | null = config.client ?? null

  function getClient() {
    if (!client) {
      throw new NaviosError('[Navios-API]: Client was not provided')
    }
    return client
  }

  function provideClient(newClient: Client) {
    client = newClient
  }

  const context = { getClient, config }

  // The implementation is loosely typed; inference happens at the call site
  // through the `BuilderInstance` interface.
  return {
    declareEndpoint: (options: BaseEndpointOptions) => createHandler(options, context),
    provideClient,
    getClient,
    withClient: (newClient: Client) => builder({ ...config, client: newClient }),
  } as BuilderInstance
}
