import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/server/adapter'
import type { Serve, Server } from 'bun'

import { BunAdapter } from './bun-adapter.mjs'

import type { BunCorsOptions } from './cors.mjs'

/** The Bun server. The parameter is the type of `ws.data` of its WebSockets. */
export type BunServer<WebSocketData = undefined> = Server<WebSocketData>

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
 *
 * An application with WebSockets that carry data names its type:
 * `BunEnvironment<{ userId: string }>`.
 */
export interface BunEnvironment<WebSocketData = undefined> extends HttpAdapterEnvironment {
  /**
   * `request` is the request of `Bun.serve`. Reading a body without a declared
   * length (chunked transfer encoding) fails with a 413 once it is over the
   * body limit.
   */
  raw: { request: Request; server: BunServer<WebSocketData> | null }
  server: BunServer<WebSocketData>
  listenOptions: BunListenOptions
}

/** Where to listen. Not used with `serve.unix`. */
export interface BunListenOptions {
  /** @default 3000 */
  port?: number
  /** @default 'localhost' */
  hostname?: string
}

export interface BunAdapterOptions<WebSocketData = undefined> {
  /** Enables CORS. */
  cors?: BunCorsOptions
  /**
   * Extra options for `Bun.serve`. `routes`, `fetch`, `port` and `hostname` are set by the adapter.
   *
   * With `websocket`, a handler upgrades its request with
   * `ctx.raw.server.upgrade(ctx.raw.request)`. With `unix`, the server listens
   * on that socket, and `listen()` takes no options.
   *
   * `maxRequestBodySize` is enforced by the adapter, which answers a larger
   * body with a 413 problem response. Bun would answer with an empty 413
   * before the adapter saw the request. When it is not set the limit is the
   * 128 MiB of Bun. A body is held in memory, so lower it for an application
   * that does not take large uploads.
   */
  serve?: Omit<Serve.Options<WebSocketData, string>, 'routes' | 'fetch' | 'port' | 'hostname'>
}

/**
 * Runs a Navios application on `Bun.serve`.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment({ cors: { origin: ['https://app.example.com'] } }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineBunEnvironment<WebSocketData = undefined>(
  options: BunAdapterOptions<WebSocketData> = {},
): AdapterDefinition<BunEnvironment<WebSocketData>> {
  return { name: 'bun', create: (context) => new BunAdapter(options, context) }
}
