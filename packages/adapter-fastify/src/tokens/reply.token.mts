import { Token } from '@navios/di'

import type { FastifyReply } from 'fastify'

/**
 * Injection token for the current Fastify reply object.
 *
 * This token provides access to the current HTTP response object within request-scoped
 * services. The reply is automatically injected into the request-scoped container
 * for each incoming request, allowing direct control over the response.
 *
 * @example
 * ```ts
 * @Injectable()
 * class ResponseService {
 *   @Inject(FastifyReplyToken) accessor reply!: FastifyReply
 *
 *   setHeader(key: string, value: string) {
 *     this.reply.header(key, value)
 *   }
 *
 *   send(data: any) {
 *     this.reply.send(data)
 *   }
 * }
 * ```
 */
export const FastifyReplyToken = Token.create<FastifyReply>('FastifyReplyToken')
