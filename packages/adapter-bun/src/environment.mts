import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/server'
import type { Serve, Server } from 'bun'

import { BunAdapter } from './bun-adapter.mjs'

import type { BunCorsOptions } from './cors.mjs'

export type BunServer = Server<undefined>

/**
 * Types an application that runs on Bun:
 *
 * ```ts
 * declare module '@navios/server' {
 *   interface Register {
 *     environment: BunEnvironment
 *   }
 * }
 * ```
 */
export interface BunEnvironment extends HttpAdapterEnvironment {
  /**
   * `request` is the request of `Bun.serve`. For a body without a declared
   * length (chunked transfer encoding) it is a copy of that request whose
   * body fails with a 413 once it is over the body limit; the copy does not
   * have the `params` and `cookies` that Bun adds.
   */
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
   * `maxRequestBodySize` is enforced by the adapter, which answers a larger
   * body with a 413 problem response. Bun would answer with an empty 413
   * before the adapter saw the request. When it is not set the limit is the
   * 128 MiB of Bun. A body is held in memory, so lower it for an application
   * that does not take large uploads.
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
