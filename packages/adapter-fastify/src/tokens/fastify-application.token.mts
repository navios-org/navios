import { Token } from '@navios/di'

import type { FastifyApplicationServiceInterface } from '../interfaces/application.interface.mjs'

/**
 * Injection token for the Fastify application service.
 *
 * This token is used to inject the `FastifyApplicationService` instance
 * into the dependency injection container. It provides access to the
 * HTTP adapter service for advanced use cases.
 *
 * @example
 * ```ts
 * @Injectable()
 * class MyService {
 *   @Inject(FastifyApplicationServiceToken) accessor appService!: FastifyApplicationServiceInterface
 *
 *   getServer() {
 *     return this.appService.getServer()
 *   }
 * }
 * ```
 */
export const FastifyApplicationServiceToken =
  Token.create<FastifyApplicationServiceInterface>('FastifyApplicationService')
