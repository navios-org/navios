import { Token } from '@navios/di'

import type { Server } from 'bun'

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
 *   @Inject(BunServerToken) accessor server!: Server<undefined>
 *
 *   upgrade(request: Request) {
 *     // Use server instance for WebSocket upgrades
 *     return this.server.upgrade(request)
 *   }
 * }
 * ```
 */
export const BunServerToken = Token.create<Server<undefined>>('BunServerToken')
