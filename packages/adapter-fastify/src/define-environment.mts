import {
  AdapterToken,
  EndpointAdapterToken,
  HttpAdapterToken,
  InjectionToken,
  MultipartAdapterToken,
  Reply,
  Request,
  StreamAdapterToken,
} from '@navios/core'

import type { AnyInjectableType } from '@navios/core'

import {
  FastifyEndpointAdapterService,
  FastifyMultipartAdapterService,
  FastifyStreamAdapterService,
} from './adapters/index.mjs'
import { FastifyApplicationService } from './services/index.mjs'
import { FastifyReplyToken, FastifyRequestToken } from './tokens/index.mjs'

/**
 * Creates a Fastify adapter environment configuration for Navios.
 *
 * This function sets up the necessary dependency injection tokens and services
 * required to run Navios applications on the Fastify runtime. It configures:
 * - HTTP adapter service for handling HTTP requests
 * - Endpoint adapter for standard REST endpoints
 * - Stream adapter for streaming responses
 * - Multipart adapter for file uploads and form data
 * - Request and Reply tokens for accessing Fastify request/reply objects
 *
 * @returns An object containing the token mappings for the Fastify adapter.
 * This object should be passed to `NaviosFactory.create()` as the `adapter` option.
 *
 * @example
 * ```ts
 * import { defineFastifyEnvironment } from '@navios/adapter-fastify'
 * import { NaviosFactory } from '@navios/core'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 * ```
 *
 * @example
 * ```ts
 * // With CORS and multipart support
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * app.enableCors({
 *   origin: true,
 *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
 * })
 *
 * app.enableMultipart({
 *   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
 * })
 * ```
 *
 * @see {@link FastifyApplicationService} The HTTP adapter service implementation
 * @see {@link FastifyEndpointAdapterService} The endpoint adapter implementation
 * @see {@link FastifyStreamAdapterService} The stream adapter implementation
 * @see {@link FastifyMultipartAdapterService} The multipart adapter implementation
 */
export function defineFastifyEnvironment() {
  const tokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>([
    [AdapterToken, FastifyApplicationService],
    [HttpAdapterToken, FastifyApplicationService],
    [EndpointAdapterToken, FastifyEndpointAdapterService],
    [StreamAdapterToken, FastifyStreamAdapterService],
    [MultipartAdapterToken, FastifyMultipartAdapterService],
    [Request, FastifyRequestToken],
    [Reply, FastifyReplyToken],
  ])
  return {
    tokens,
  }
}
