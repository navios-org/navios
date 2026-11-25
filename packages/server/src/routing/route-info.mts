import type { HandlerInfo } from '@navios/core'

import type { RouteEndpointConfig } from './endpoint-config.mjs'

export type { AttributeMap } from '@navios/core'

/**
 * Everything known about a route after the application has been initialised.
 */
export interface RouteInfo extends HandlerInfo {
  readonly method: string
  /** Full path with every prefix applied, in builder form (`/users/$id`). */
  readonly path: string
  /** The builder declaration's `config`. */
  readonly endpoint: RouteEndpointConfig
}
