import { InjectionToken } from '@navios/core'

/**
 * Injection token for the current Bun request object.
 *
 * This token provides access to the current HTTP request within request-scoped
 * services. The request is automatically injected into the request-scoped container
 * for each incoming request.
 *
 * @example
 * ```ts
 * @Injectable()
 * class RequestService {
 *   private request = inject(BunRequestToken)
 *
 *   getUrl() {
 *     return this.request.url
 *   }
 *
 *   getMethod() {
 *     return this.request.method
 *   }
 * }
 * ```
 */
export const BunRequestToken = InjectionToken.create<Request>('BunRequestToken')
