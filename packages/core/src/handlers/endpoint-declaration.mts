import type { BaseEndpointOptions } from '@navios/builder'

import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'

/**
 * Anything with a builder declaration's `config`.
 */
export interface EndpointDeclaration<Config extends BaseEndpointOptions = BaseEndpointOptions> {
  config: Config
}

/** @internal */
export function endpointConfig(endpoint: EndpointDeclaration): RouteEndpointConfig {
  return endpoint.config as unknown as RouteEndpointConfig
}
