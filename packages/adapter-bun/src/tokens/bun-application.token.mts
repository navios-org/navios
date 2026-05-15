import { Token } from '@navios/di'

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
 *   @Inject(BunApplicationServiceToken) accessor appService!: BunApplicationServiceInterface
 *
 *   getServer() {
 *     return this.appService.getServer()
 *   }
 * }
 * ```
 */
export const BunApplicationServiceToken =
  Token.create<BunApplicationServiceInterface>('BunApplicationService')
