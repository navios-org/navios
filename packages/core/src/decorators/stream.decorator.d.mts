import type { BaseStreamConfig, EndpointFunctionArgs, HttpMethod, Util_FlatObject } from '@navios/builder';
import type { ZodObject, ZodType } from 'zod/v4';
/**
 * Extracts the typed parameters for a stream endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for streaming endpoints.
 *
 * @typeParam EndpointDeclaration - The stream endpoint declaration from @navios/builder
 */
export type StreamParams<EndpointDeclaration extends {
    config: BaseStreamConfig<any, any, any, any>;
}, Url extends string = EndpointDeclaration['config']['url'], QuerySchema = EndpointDeclaration['config']['querySchema']> = QuerySchema extends ZodObject ? EndpointDeclaration['config']['requestSchema'] extends ZodType ? Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, EndpointDeclaration['config']['requestSchema'], true>> : Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined, true>> : EndpointDeclaration['config']['requestSchema'] extends ZodType ? Util_FlatObject<EndpointFunctionArgs<Url, undefined, EndpointDeclaration['config']['requestSchema'], true>> : Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined, true>>;
/**
 * Decorator that marks a method as a streaming endpoint.
 *
 * Use this decorator for endpoints that stream data (e.g., file downloads, SSE).
 * The endpoint must be defined using @navios/builder's `declareStream` method.
 *
 * @param endpoint - The stream endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * const downloadFileEndpoint = api.declareStream({
 *   method: 'get',
 *   url: '/files/$fileId',
 * })
 *
 * @Controller()
 * export class FileController {
 *   @Stream(downloadFileEndpoint)
 *   async downloadFile(request: StreamParams<typeof downloadFileEndpoint>, reply: any) {
 *     const { fileId } = request.urlParams
 *     // Stream file data to reply
 *   }
 * }
 * ```
 */
export declare function Stream<Method extends HttpMethod = HttpMethod, Url extends string = string, QuerySchema = undefined, RequestSchema = ZodType>(endpoint: {
    config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>;
}): (target: (params: QuerySchema extends ZodObject ? RequestSchema extends ZodType ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema> : EndpointFunctionArgs<Url, QuerySchema, undefined> : RequestSchema extends ZodType ? EndpointFunctionArgs<Url, undefined, RequestSchema> : EndpointFunctionArgs<Url, undefined, undefined>, reply: any) => Promise<void>, context: ClassMethodDecoratorContext) => (params: QuerySchema extends ZodObject ? RequestSchema extends ZodType ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema> : EndpointFunctionArgs<Url, QuerySchema, undefined> : RequestSchema extends ZodType ? EndpointFunctionArgs<Url, undefined, RequestSchema> : EndpointFunctionArgs<Url, undefined, undefined>, reply: any) => Promise<void>;
//# sourceMappingURL=stream.decorator.d.mts.map