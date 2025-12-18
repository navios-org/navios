import type { FastifyReply } from 'fastify'

import { InjectionToken } from '@navios/core'

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
 *   private reply = inject(FastifyReplyToken)
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
export const FastifyReplyToken =
  InjectionToken.create<FastifyReply>('FastifyReplyToken')
