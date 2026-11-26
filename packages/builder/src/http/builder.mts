import { NaviosError } from '../shared/navios-error.mjs'

import { createHandler } from './create-handler.mjs'

import type { BuilderConfig } from './builder-config.mjs'
import type { BuilderInstance } from './builder-instance.mjs'
import type { Client } from './client.mjs'
import type { BaseEndpointOptions } from './endpoint-options.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

/**
 * Creates a new API builder instance.
 *
 * The builder declares API endpoints with type-safe request and response
 * schemas from any Standard Schema library (Zod, Valibot, ArkType, ...).
 * Every endpoint can be called in two ways: `endpoint(args)` throws an
 * `EndpointError` on failure, `endpoint.safe(args)` returns a `SafeResult`
 * and never throws.
 *
 * @param config - Configuration options for the builder
 * @param config.client - HTTP client used by every endpoint
 * @param config.send - Whether the caller's arguments (`'input'`, the default)
 *   or the output of the request schemas (`'output'`) is sent
 * @param config.onError - Telemetry hook, called once per failed call with the
 *   `EndpointError` the caller receives
 * @param config.errorSchema - Error schemas every endpoint shares, merged
 *   under each endpoint's own `errorSchema`
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
export function builder<Errors extends ErrorSchemaRecord = {}>(
  config?: BuilderConfig<Errors>,
): BuilderInstance<Errors>
// Last, so that `ReturnType<typeof builder>` is the plain `BuilderInstance`
export function builder(config?: BuilderConfig): BuilderInstance
export function builder(
  config: BuilderConfig<ErrorSchemaRecord> = {},
): BuilderInstance<ErrorSchemaRecord> {
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
  const shared = config.errorSchema

  /** The declaration an endpoint gets: its own, with the shared error schemas under its own. */
  function withSharedErrors(options: BaseEndpointOptions): BaseEndpointOptions {
    if (!shared) return options
    return { ...options, errorSchema: { ...shared, ...options.errorSchema } }
  }

  // The implementation is loosely typed; inference happens at the call site
  // through the `BuilderInstance` interface.
  return {
    errorSchema: shared ?? {},
    declareEndpoint: (options: BaseEndpointOptions) =>
      createHandler(withSharedErrors(options), context),
    provideClient,
    getClient,
  } as unknown as BuilderInstance<ErrorSchemaRecord>
}
