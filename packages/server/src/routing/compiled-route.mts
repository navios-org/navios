import type { RouteInfo } from './route-info.mjs'
import type { RouteInput } from './route-input.mjs'
import type { RoutePath } from './route-path.mjs'
import type { RouteResponse } from './route-response.mjs'

/** Handles one request. It does not throw, and its promise does not reject. */
export type RouteExecutor = (input: RouteInput) => RouteResponse | Promise<RouteResponse>

export interface CompiledRoute {
  readonly info: RouteInfo
  /** `info.path`, taken apart for a router. */
  readonly path: RoutePath
  readonly execute: RouteExecutor
}
