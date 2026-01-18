import type { HttpAdapterEnvironment } from '@navios/core'
import type { Server } from 'bun'

import type { BunCorsOptions } from '../utils/cors.util.mjs'

import type {
  BunApplicationOptions,
  BunApplicationServiceInterface,
  BunListenOptions,
} from './application.interface.mjs'

/**
 * Environment interface for the Bun HTTP adapter.
 *
 * Provides type-safe access to Bun-specific types when using
 * `NaviosApplication<BunEnvironment>`.
 *
 * @example
 * ```typescript
 * import { defineBunEnvironment, BunEnvironment } from '@navios/adapter-bun'
 * import { NaviosFactory } from '@navios/core'
 *
 * const app = await NaviosFactory.create<BunEnvironment>(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * // All methods are now type-safe for Bun
 * app.configure({ development: true })
 * app.enableCors({ origin: true }) // BunCorsOptions
 * const server = app.getServer() // Server<undefined>
 * await app.listen({ port: 3000 }) // BunListenOptions
 * ```
 */
export interface BunEnvironment extends HttpAdapterEnvironment {
  /** Bun.Server instance */
  server: Server<undefined>
  /** BunCorsOptions for CORS configuration */
  corsOptions: BunCorsOptions
  /** Multipart is handled natively by Bun */
  multipartOptions: never
  /** BunListenOptions for server listen configuration */
  listenOptions: BunListenOptions
  /** BunApplicationOptions for server setup */
  options: BunApplicationOptions
  /** BunApplicationServiceInterface for the Bun application service */
  adapter: BunApplicationServiceInterface
}
