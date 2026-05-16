import { Token } from '@navios/di'

import type { FastifyRequest } from 'fastify'

/**
 * Injection token for the current Fastify request object.
 *
 * This token provides access to the current HTTP request within request-scoped
 * services. The request is automatically injected into the request-scoped container
 * for each incoming request.
 *
 * @example
 * ```ts
 * @Injectable()
 * class RequestService {
 *   @Inject(FastifyRequestToken) accessor request!: FastifyRequest
 *
 *   getUrl() {
 *     return this.request.url
 *   }
 *
 *   getMethod() {
 *     return this.request.method
 *   }
 *
 *   getHeaders() {
 *     return this.request.headers
 *   }
 * }
 * ```
 */
export const FastifyRequestToken = Token.create<FastifyRequest>('FastifyRequestToken')
