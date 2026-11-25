import type { RouteInfo } from './route-info.mjs'
import type { RouteInput } from './route-input.mjs'
import type { RouteResult } from './route-result.mjs'

export type RouteExecutor = (input: RouteInput) => RouteResult | Promise<RouteResult>

export interface CompiledRoute {
  readonly info: RouteInfo
  readonly execute: RouteExecutor
}
