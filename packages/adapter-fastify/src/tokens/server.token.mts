import { InjectionToken } from '@navios/core'

import type { FastifyInstance } from 'fastify'

/**
 * Injection token for the Fastify server instance.
 *
 * This token provides access to the underlying Fastify server instance,
 * allowing direct interaction with Fastify's API for advanced use cases
 * such as registering custom plugins, hooks, decorators, or accessing
 * server-level functionality.
 *
 * @example
 * ```ts
 * @Injectable()
 * class PluginService {
 *   private server = inject(FastifyServerToken)
 *
 *   async registerStaticFiles() {
 *     await this.server.register(require('@fastify/static'), {
 *       root: path.join(__dirname, 'public'),
 *       prefix: '/public/',
 *     })
 *   }
 * }
 * ```
 */
export const FastifyServerToken = InjectionToken.create<FastifyInstance>('FastifyServerToken')
