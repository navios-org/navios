import type { EndpointHandler, ServerRequestArgs } from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { MultipartAdapterToken } from '../tokens/index.mjs'

import {
  applyDeclaredSuccessStatus,
  assertDeclarationMatchesDecorator,
} from './endpoint-declaration.mjs'

import type { EndpointResponseConfig, MultipartDecoratorConfig } from './endpoint-declaration.mjs'
import type { EndpointHandlerReturn, EndpointResult } from './endpoint.decorator.mjs'
import type { ZodBaseEndpointOptions } from './zod-endpoint-options.mjs'

/**
 * Extracts the typed parameters for a multipart endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for multipart/form-data endpoints.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 */
export type MultipartParams<
  EndpointDeclaration extends {
    config: ZodBaseEndpointOptions
  },
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends ZodObject
  ? EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? ServerRequestArgs<{
        url: Url
        querySchema: QuerySchema
        requestSchema: EndpointDeclaration['config']['requestSchema']
        urlParamsSchema: EndpointDeclaration['config']['urlParamsSchema']
      }>
    : ServerRequestArgs<{
        url: Url
        querySchema: QuerySchema
        urlParamsSchema: EndpointDeclaration['config']['urlParamsSchema']
      }>
  : EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? ServerRequestArgs<{
        url: Url
        requestSchema: EndpointDeclaration['config']['requestSchema']
        urlParamsSchema: EndpointDeclaration['config']['urlParamsSchema']
      }>
    : ServerRequestArgs<{
        url: Url
        urlParamsSchema: EndpointDeclaration['config']['urlParamsSchema']
      }>

/**
 * Extracts the typed return value for a multipart endpoint handler function.
 *
 * The same as `EndpointResult`: a Promise of the input of `responseSchema`,
 * `Promise<void>` for a `response: 'void'` endpoint, and a Promise of the
 * union of `reply(status, body)` results for an endpoint declared with a
 * per-status `responses` map.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 */
export type MultipartResult<
  EndpointDeclaration extends {
    config: EndpointResponseConfig
  },
> = EndpointResult<EndpointDeclaration>

/**
 * Decorator that marks a method as a multipart/form-data endpoint.
 *
 * Use this decorator for endpoints that handle file uploads or form data.
 * The endpoint must be defined using @navios/builder's `declareEndpoint` method with `body: 'multipart'`:
 * a declaration without it does not compile, and throws when the decorator is applied
 * (the client would send JSON while the server expects form data). The schemas must be Zod schemas.
 *
 * @param endpoint - The multipart endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * const uploadFileEndpoint = api.declareEndpoint({
 *   method: 'post',
 *   url: '/upload',
 *   body: 'multipart',
 *   requestSchema: z.object({ file: z.instanceof(File) }),
 *   responseSchema: z.object({ url: z.string() }),
 * })
 *
 * @Controller()
 * export class FileController {
 *   @Multipart(uploadFileEndpoint)
 *   async uploadFile(request: MultipartParams<typeof uploadFileEndpoint>) {
 *     const { file } = request.data
 *     // Handle file upload
 *     return { url: 'https://example.com/file.jpg' }
 *   }
 * }
 * ```
 *
 * ## Responses
 *
 * The response side takes exactly what `@Endpoint` takes:
 *
 * - a `responseSchema` (`response` absent or `'json'`): the method returns the
 *   body, answered with 200 unless `@HttpCode` sets another status;
 * - `response: 'void'`: the method returns nothing and the reply is
 *   **204 No Content** with an empty body, unless `@HttpCode` sets another
 *   status;
 * - a per-status `responses` map: the method picks a declared status and its
 *   body with `reply(status, body)`. `@HttpCode` cannot be combined with it
 *   and throws when the decorators are applied.
 *
 * `response: 'blob' | 'text' | 'stream'` is not served by `@Multipart`: it
 * does not compile, and throws when the decorator is applied.
 *
 * @example
 * ```typescript
 * const importUsersEndpoint = api.declareEndpoint({
 *   method: 'POST',
 *   url: '/users/import',
 *   body: 'multipart',
 *   requestSchema: z.object({ file: z.instanceof(File) }),
 *   responses: { 201: importReportSchema, 204: null },
 * })
 *
 * @Controller()
 * export class UserController {
 *   @Multipart(importUsersEndpoint)
 *   async importUsers(request: MultipartParams<typeof importUsersEndpoint>) {
 *     const report = await this.users.import(request.data.file)
 *     return report.created === 0 ? reply(204) : reply(201, report)
 *   }
 * }
 * ```
 */
export function Multipart<const Config extends MultipartDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
): (
  target: (
    params: ServerRequestArgs<Config>,
  ) => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>,
  context: ClassMethodDecoratorContext,
) => void
export function Multipart<const Config extends MultipartDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
): (
  target: () => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>,
  context: ClassMethodDecoratorContext,
) => void
export function Multipart<const Config extends MultipartDecoratorConfig>(
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
    assertDeclarationMatchesDecorator('Multipart', config)
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<MultipartDecoratorConfig>(target, context)
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      endpointMetadata.config = config
      endpointMetadata.adapterToken = MultipartAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
      applyDeclaredSuccessStatus(endpointMetadata, config)
    }
    return target
  }
}
