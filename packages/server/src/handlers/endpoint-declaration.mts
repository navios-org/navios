import type { BaseEndpointOptions } from '@navios/builder'
import type { MethodHandlerMetadata } from '@navios/core/transport'

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

/**
 * Where `@Endpoint` keeps a member's endpoint among its entries.
 * @internal
 */
export const EndpointEntryKey = Symbol.for('navios.server.endpoint')

/**
 * The endpoint a member serves, or `null` when it is not an HTTP handler.
 * @internal
 */
export function memberEndpoint(member: MethodHandlerMetadata): RouteEndpointConfig | null {
  return (member.entries.get(EndpointEntryKey) as RouteEndpointConfig | undefined) ?? null
}
