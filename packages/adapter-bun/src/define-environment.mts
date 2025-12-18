import type { AnyInjectableType } from '@navios/core'

import {
  EndpointAdapterToken,
  HttpAdapterToken,
  InjectionToken,
  MultipartAdapterToken,
  Request,
  StreamAdapterToken,
} from '@navios/core'

import {
  BunEndpointAdapterService,
  BunMultipartAdapterService,
  BunStreamAdapterService,
} from './adapters/index.mjs'
import { BunApplicationService } from './services/index.mjs'
import { BunRequestToken } from './tokens/index.mjs'

/**
 * Creates a Bun adapter environment configuration for Navios.
 *
 * This function sets up the necessary dependency injection tokens and services
 * required to run Navios applications on the Bun runtime. It configures:
 * - HTTP adapter service for handling HTTP requests
 * - Endpoint adapter for standard REST endpoints
 * - Stream adapter for streaming responses
 * - Multipart adapter for file uploads and form data
 * - Request token for accessing the current Bun request
 *
 * @returns An object containing the HTTP token mappings for the Bun adapter.
 * This object should be passed to `NaviosFactory.create()` as the `adapter` option.
 *
 * @example
 * ```ts
 * import { defineBunEnvironment } from '@navios/adapter-bun'
 * import { NaviosFactory } from '@navios/core'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 * ```
 *
 * @example
 * ```ts
 * // With custom Bun server options
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * await app.setupHttpServer({
 *   development: process.env.NODE_ENV === 'development',
 * })
 * ```
 *
 * @see {@link BunApplicationService} The HTTP adapter service implementation
 * @see {@link BunEndpointAdapterService} The endpoint adapter implementation
 * @see {@link BunStreamAdapterService} The stream adapter implementation
 * @see {@link BunMultipartAdapterService} The multipart adapter implementation
 */
export function defineBunEnvironment() {
  const httpTokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>(
    [
      [EndpointAdapterToken, BunEndpointAdapterService],
      [StreamAdapterToken, BunStreamAdapterService],
      [MultipartAdapterToken, BunMultipartAdapterService], // Use stream for multipart
      [HttpAdapterToken, BunApplicationService],
      [Request, BunRequestToken],
    ],
  )
  return {
    httpTokens,
  }
}
