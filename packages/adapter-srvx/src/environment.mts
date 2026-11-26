import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/server/adapter'
import type { CorsOptions } from '@navios/server/web'
import type { Server, ServerOptions, ServerRequest } from 'srvx'

import { SrvxAdapter } from './srvx-adapter.mjs'

/** The server of srvx. */
export type SrvxServer = Server

/** The request of srvx: a web `Request` with `ip`, `runtime` and `waitUntil`. */
export type SrvxRequest = ServerRequest

/** CORS options of the srvx adapter. */
export type SrvxCorsOptions = CorsOptions

/**
 * Types an application that runs on srvx:
 *
 * ```ts
 * declare module '@navios/server' {
 *   interface Register {
 *     environment: SrvxEnvironment
 *   }
 * }
 * ```
 */
export interface SrvxEnvironment extends HttpAdapterEnvironment {
  /**
   * `request` is the request of srvx. What belongs to the runtime is in
   * `request.runtime`: the request and response of Node, the server of Bun,
   * `env` and the execution context of Cloudflare. `server` is `null` for a
   * request of `inject()` before there is a server.
   */
  raw: { request: SrvxRequest; server: SrvxServer | null }
  server: SrvxServer
  listenOptions: SrvxListenOptions
}

/** Where to listen. What is left out is decided by srvx. */
export interface SrvxListenOptions {
  /** The default of srvx: the `PORT` environment variable, or 3000. */
  port?: number
  /** The default of srvx: the `HOST` environment variable, or every interface. */
  hostname?: string
}

export interface SrvxAdapterOptions {
  /** Enables CORS. */
  cors?: SrvxCorsOptions
  /**
   * Extra options for `serve()` of srvx. `fetch`, `port`, `hostname` and
   * `manual` are set by the adapter.
   *
   * `maxRequestBodySize` is enforced by the adapter, on every runtime, which
   * answers a larger body with a 413 problem response. When it is not set
   * there is no limit, as in srvx. A body is held in memory, so set it.
   *
   * `silent` is on unless it is set, and `gracefulShutdown` is off: an
   * application is closed with `app.close()`, or by `app.enableShutdownHooks()`.
   */
  serve?: Omit<ServerOptions, 'fetch' | 'port' | 'hostname' | 'manual'>
}

/**
 * Runs a Navios application on srvx: on Node.js, Deno and Bun with
 * `app.listen()`, and with the `fetch` of `app.getServer()` where the runtime
 * calls the application, as Cloudflare Workers do.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineSrvxEnvironment({ cors: { origin: ['https://app.example.com'] } }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineSrvxEnvironment(
  options: SrvxAdapterOptions = {},
): AdapterDefinition<SrvxEnvironment> {
  return { create: (context) => new SrvxAdapter(options, context) }
}
