import type {
  EndpointHandler,
  EndpointOptions,
  RequestArgs,
} from '@navios/builder'
import type { z } from 'zod/v4'

import { ZodDiscriminatedUnion } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { EndpointAdapterToken } from '../tokens/index.mjs'

/**
 * Extracts the typed parameters for an endpoint handler function.
 *
 * This utility type extracts URL parameters, query parameters, and request body
 * from an endpoint declaration and flattens them into a single object.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 *
 * @example
 * ```typescript
 * const getUserEndpoint = api.declareEndpoint({
 *   method: 'get',
 *   url: '/users/$userId',
 *   querySchema: z.object({ include: z.string().optional() }),
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Endpoint(getUserEndpoint)
 * async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *   // request.urlParams.userId is typed as string
 *   // request.query.include is typed as string | undefined
 * }
 * ```
 */
export type EndpointParams<
  EndpointDeclaration extends EndpointHandler<Config, false>,
  Config extends EndpointOptions = EndpointDeclaration['config'],
> = RequestArgs<
  Config['url'],
  Config['querySchema'],
  Config['requestSchema'],
  Config['urlParamsSchema'],
  true
>

/**
 * Extracts the typed return value for an endpoint handler function.
 *
 * This utility type extracts the response schema from an endpoint declaration
 * and returns the appropriate Promise type.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 *
 * @example
 * ```typescript
 * const getUserEndpoint = api.declareEndpoint({
 *   method: 'get',
 *   url: '/users/$userId',
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Endpoint(getUserEndpoint)
 * async getUser(request: EndpointParams<typeof getUserEndpoint>): EndpointResult<typeof getUserEndpoint> {
 *   return { id: '1', name: 'John' } // Type-checked against responseSchema
 * }
 * ```
 */
export type EndpointResult<
  EndpointDeclaration extends {
    config: EndpointOptions
  },
> =
  EndpointDeclaration['config']['responseSchema'] extends ZodDiscriminatedUnion<
    infer Options
  >
    ? Promise<z.input<Options[number]>>
    : Promise<z.input<EndpointDeclaration['config']['responseSchema']>>

/**
 * Decorator that marks a method as an HTTP endpoint.
 *
 * The endpoint must be defined using @navios/builder's `declareEndpoint` method.
 * This ensures type safety and consistency between client and server.
 *
 * @param endpoint - The endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * import { builder } from '@navios/builder'
 *
 * const api = builder()
 * const getUserEndpoint = api.declareEndpoint({
 *   method: 'get',
 *   url: '/users/$userId',
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *     const { userId } = request.urlParams
 *     return { id: userId, name: 'John' }
 *   }
 * }
 * ```
 */
export function Endpoint<const Config extends EndpointOptions>(
  endpoint: EndpointHandler<Config, false>,
): (
  target: (
    params: RequestArgs<
      Config['url'],
      Config['querySchema'],
      Config['requestSchema'],
      Config['urlParamsSchema'],
      true
    >,
  ) =>
    | Promise<z.input<Config['responseSchema']>>
    | z.input<Config['responseSchema']>,
  context: ClassMethodDecoratorContext,
) => void
export function Endpoint<const Config extends EndpointOptions>(
  endpoint: EndpointHandler<Config, false>,
): (
  target: () =>
    | Promise<z.input<Config['responseSchema']>>
    | z.input<Config['responseSchema']>,
  context: ClassMethodDecoratorContext,
) => void
export function Endpoint<const Config extends EndpointOptions>(
  endpoint: EndpointHandler<Config, false>,
) {
  type Params = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema'],
    true
  >

  type Handler =
    | ((
        params: Params,
      ) =>
        | Promise<z.input<Config['responseSchema']>>
        | z.input<Config['responseSchema']>)
    | (() =>
        | Promise<z.input<Config['responseSchema']>>
        | z.input<Config['responseSchema']>)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on methods.',
      )
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<EndpointOptions>(
        target,
        context,
      )
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      endpointMetadata.config = config
      endpointMetadata.adapterToken = EndpointAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
