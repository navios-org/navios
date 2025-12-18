import { InjectionToken } from '@navios/core'

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
 *   private appService = inject(FastifyApplicationServiceToken)
 *
 *   getServer() {
 *     return this.appService.getServer()
 *   }
 * }
 * ```
 */
export const FastifyApplicationServiceToken =
  InjectionToken.create<FastifyApplicationServiceInterface>(
    'FastifyApplicationService',
  )
