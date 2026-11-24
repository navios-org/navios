import { getEndpointMetadata, setSuccessStatusCode } from '../metadata/index.mjs'
import { EndpointAdapterToken, MultipartAdapterToken } from '../tokens/index.mjs'

import { httpCodeOnResponsesEndpoint } from './http-code-on-responses.error.mjs'

/**
 * Decorator that sets a custom HTTP status code for successful responses.
 *
 * By default, endpoints return 200 OK (204 No Content for an endpoint declared
 * with `response: 'void'`). Use this decorator to return a different status code.
 * It wins over the default wherever it is placed relative to `@Endpoint` or
 * `@Multipart`.
 *
 * It cannot be used on an endpoint declared with a per-status `responses`
 * map: there the method picks the status with `reply(status, body)`, and
 * combining the two throws when the decorators are applied.
 *
 * @param code - The HTTP status code to return (e.g., 201, 204, 202)
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(createUserEndpoint)
 *   @HttpCode(201)
 *   async createUser() {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export function HttpCode(code: number) {
  return <T extends Function>(target: T, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] HttpCode decorator can only be used on methods.')
    }
    const metadata = getEndpointMetadata(target, context)
    const servesResponsesMap =
      metadata.adapterToken === EndpointAdapterToken ||
      metadata.adapterToken === MultipartAdapterToken
    if (servesResponsesMap && metadata.config?.responses) {
      throw httpCodeOnResponsesEndpoint(metadata.config)
    }
    setSuccessStatusCode(metadata, code)

    return target
  }
}
