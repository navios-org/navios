import type { ClassType } from '@navios/di'

import type { RouteEndpointConfig } from './endpoint-config.mjs'

export type AttributeMap = ReadonlyMap<symbol, unknown>

/**
 * Everything known about a route after the application has been initialised.
 */
export interface RouteInfo {
  readonly method: string
  /** Full path with every prefix applied, in builder form (`/users/$id`). */
  readonly path: string
  /** The builder declaration's `config`. */
  readonly endpoint: RouteEndpointConfig
  readonly module: ClassType | null
  readonly controller: ClassType
  readonly handlerName: string
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
  readonly attributes: {
    readonly handler: AttributeMap
    readonly controller: AttributeMap
    readonly module: AttributeMap
  }
}
