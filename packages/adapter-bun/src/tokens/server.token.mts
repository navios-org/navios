import type { Server } from 'bun'

import { InjectionToken } from '@navios/core'

/**
 * Injection token for the Bun server instance.
 *
 * This token provides access to the underlying Bun server instance,
 * allowing direct interaction with Bun's server API for advanced use cases
 * such as WebSocket upgrades or custom server configuration.
 *
 * @example
 * ```ts
 * @Injectable()
 * class WebSocketService {
 *   private server = inject(BunServerToken)
 *
 *   upgrade(request: Request) {
 *     // Use server instance for WebSocket upgrades
 *     return this.server.upgrade(request)
 *   }
 * }
 * ```
 */
export const BunServerToken =
  InjectionToken.create<Server<undefined>>('BunServerToken')
