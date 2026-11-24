import { ZodDiscriminatedUnion } from 'zod/v4'

import type { EndpointHandler, ServerRequestArgs } from '@navios/builder'
import type { z, ZodType } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { EndpointAdapterToken } from '../tokens/index.mjs'

import {
  applyDeclaredSuccessStatus,
  assertDeclarationMatchesDecorator,
} from './endpoint-declaration.mjs'

import type {
  EndpointDecoratorConfig,
  EndpointRepliesOf,
  EndpointResponseConfig,
  ZodResponsesRecord,
} from './endpoint-declaration.mjs'
import type { ZodBaseEndpointOptions } from './zod-endpoint-options.mjs'

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
  EndpointDeclaration extends { config: ZodBaseEndpointOptions },
  Config extends ZodBaseEndpointOptions = EndpointDeclaration['config'],
> = ServerRequestArgs<Config>

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
 *
 * For an endpoint declared with `response: 'void'` the result is `Promise<void>`.
 *
 * For an endpoint declared with a per-status `responses` map the result is a
 * Promise of the union of `reply(status, body)` results, one per declared
 * status: the body is the input of that status's schema, and there is none
 * for a `null` entry.
 *
 * @example
 * ```typescript
 * const putUserEndpoint = api.declareEndpoint({
 *   method: 'PUT',
 *   url: '/users/$userId',
 *   responses: { 200: userSchema, 204: null },
 * })
 *
 * type Result = EndpointResult<typeof putUserEndpoint>
 * // Promise<EndpointReply<200, { id: string; name: string }> | EndpointReply<204, undefined>>
 * ```
 */
export type EndpointResult<
  EndpointDeclaration extends {
    config: EndpointResponseConfig
  },
> = EndpointDeclaration['config'] extends { response: 'void' }
  ? Promise<void>
  : EndpointDeclaration['config'] extends { responses: infer Responses extends ZodResponsesRecord }
    ? Promise<EndpointRepliesOf<Responses>>
    : EndpointDeclaration['config']['responseSchema'] extends ZodDiscriminatedUnion<infer Options>
      ? Promise<z.input<Options[number]>>
      : EndpointDeclaration['config']['responseSchema'] extends ZodType
        ? Promise<z.input<EndpointDeclaration['config']['responseSchema']>>
        : never

/**
 * What a method decorated with `@Endpoint` or `@Multipart` returns (before
 * `await`): nothing for a `response: 'void'` endpoint, a `reply(status, body)`
 * result for an endpoint with a `responses` map, otherwise the input of
 * `responseSchema`.
 */
export type EndpointHandlerReturn<Config extends EndpointResponseConfig> = Config extends {
  response: 'void'
}
  ? void
  : Config extends { responses: infer Responses extends ZodResponsesRecord }
    ? EndpointRepliesOf<Responses>
    : Config['responseSchema'] extends ZodType
      ? z.input<Config['responseSchema']>
      : never

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
 *
 * ## Endpoints without a response body
 *
 * An endpoint declared with `response: 'void'` is answered with
 * **204 No Content** and an empty body. The method returns nothing, and no
 * response validation runs. `@HttpCode` still overrides the status.
 *
 * @example
 * ```typescript
 * const deleteUserEndpoint = api.declareEndpoint({
 *   method: 'DELETE',
 *   url: '/users/$userId',
 *   response: 'void',
 * })
 *
 * @Controller()
 * export class UserController {
 *   @Endpoint(deleteUserEndpoint)
 *   async deleteUser(request: EndpointParams<typeof deleteUserEndpoint>) {
 *     await this.users.delete(request.urlParams.userId)
 *   }
 * }
 * ```
 *
 * ## Endpoints with a response per status
 *
 * An endpoint declared with a `responses` map (instead of `responseSchema`)
 * answers with different statuses. The method picks one with
 * `reply(status, body)`: the status must be declared, the body is validated
 * with the schema of that status, and a `null` entry has no body. Returning
 * anything else is a compile error, and a server error (500) at runtime.
 *
 * `@HttpCode` cannot be combined with such an endpoint — the status comes
 * from `reply` — and throws when the decorators are applied.
 *
 * @example
 * ```typescript
 * const putUserEndpoint = api.declareEndpoint({
 *   method: 'PUT',
 *   url: '/users/$userId',
 *   requestSchema: userInputSchema,
 *   responses: { 200: userSchema, 201: createdSchema, 204: null },
 * })
 *
 * @Controller()
 * export class UserController {
 *   @Endpoint(putUserEndpoint)
 *   async putUser(request: EndpointParams<typeof putUserEndpoint>) {
 *     const result = await this.users.put(request.urlParams.userId, request.data)
 *     if (result.unchanged) return reply(204)
 *     if (result.created) return reply(201, { id: result.user.id })
 *     return reply(200, result.user)
 *   }
 * }
 * ```
 *
 * ## Decorator and declaration must agree
 *
 * `@Endpoint` serves declarations whose `body` is absent or `'json'` and whose
 * `response` is absent, `'json'` or `'void'`. A `body: 'multipart'` declaration
 * belongs to `@Multipart`, and `response: 'blob' | 'text' | 'stream'` to
 * `@Stream`. A mismatch does not compile, and throws when the decorator is
 * applied. The schemas must be Zod schemas.
 */
export function Endpoint<const Config extends EndpointDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
): (
  target: (
    params: ServerRequestArgs<Config>,
  ) => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>,
  context: ClassMethodDecoratorContext,
) => void
export function Endpoint<const Config extends EndpointDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
): (
  target: () => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>,
  context: ClassMethodDecoratorContext,
) => void
export function Endpoint<const Config extends EndpointDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
) {
  type Params = ServerRequestArgs<Config>
  type Result = Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>

  type Handler = ((params: Params) => Result) | (() => Result)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] Endpoint decorator can only be used on methods.')
    }
    const config = endpoint.config
    assertDeclarationMatchesDecorator('Endpoint', config)
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<EndpointDecoratorConfig>(target, context)
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
      applyDeclaredSuccessStatus(endpointMetadata, config)
    }
    return target
  }
}
