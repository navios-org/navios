import { InjectionToken } from '@navios/core'

import type { BunApplicationServiceInterface } from '../interfaces/application.interface.mjs'

/**
 * Injection token for the Bun application service.
 *
 * This token is used to inject the `BunApplicationService` instance
 * into the dependency injection container. It provides access to the
 * HTTP adapter service for advanced use cases.
 *
 * @example
 * ```ts
 * @Injectable()
 * class MyService {
 *   private appService = inject(BunApplicationServiceToken)
 *
 *   getServer() {
 *     return this.appService.getServer()
 *   }
 * }
 * ```
 */
export const BunApplicationServiceToken =
  InjectionToken.create<BunApplicationServiceInterface>('BunApplicationService')
