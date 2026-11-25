import type { HandlerInfo } from '../execution/execution-context.mjs'

import type { RouteEndpointConfig } from './endpoint-config.mjs'

export type { AttributeMap } from '../execution/execution-context.mjs'

export interface RouteInfo extends HandlerInfo {
  readonly method: string
  readonly path: string
  readonly endpoint: RouteEndpointConfig
}
