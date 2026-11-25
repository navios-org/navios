import type { HandlerInfo } from '@navios/core'

import type { RouteEndpointConfig } from './endpoint-config.mjs'

export type { AttributeMap } from '@navios/core'

export interface RouteInfo extends HandlerInfo {
  readonly method: string
  readonly path: string
  readonly endpoint: RouteEndpointConfig
}
