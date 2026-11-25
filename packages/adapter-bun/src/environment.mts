import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/core'
import type { Serve, Server } from 'bun'

import { BunAdapter } from './bun-adapter.mjs'

import type { BunCorsOptions } from './cors.mjs'

export type BunServer = Server<undefined>

/**
 * Types an application that runs on Bun:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: BunEnvironment
 *   }
 * }
 * ```
 */
export interface BunEnvironment extends HttpAdapterEnvironment {
  raw: { request: Request; server: BunServer | null }
  server: BunServer
  listenOptions: BunListenOptions
}

export interface BunListenOptions {
  port?: number
  hostname?: string
}

export interface BunAdapterOptions {
  /** Enables CORS. */
  cors?: BunCorsOptions
  /**
   * Extra options for `Bun.serve`. `routes`, `fetch`, `port` and `hostname` are set by the adapter.
   *
   * `maxRequestBodySize` (128 MiB when not set, as in Bun) is enforced by the
   * adapter, which answers a larger body with a 413 problem response. Bun
   * would answer with an empty 413 before the adapter saw the request.
   */
  serve?: Omit<Serve.Options<undefined, string>, 'routes' | 'fetch' | 'port' | 'hostname'>
}

/**
 * Runs a Navios application on `Bun.serve`.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment({ cors: { origin: true } }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineBunEnvironment(
  options: BunAdapterOptions = {},
): AdapterDefinition<BunEnvironment> {
  return { name: 'bun', create: (context) => new BunAdapter(options, context) }
}
