import type { BaseStreamConfig, EndpointFunctionArgs, HttpMethod } from '@navios/builder';
import type { ZodObject, ZodType } from 'zod/v4';
/**
 * Type helper to constrain a PropertyDescriptor's value to match a stream endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type StreamMethodDescriptor<Url extends string, QuerySchema, RequestSchema> = TypedPropertyDescriptor<(params: QuerySchema extends ZodObject ? RequestSchema extends ZodType ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema> : EndpointFunctionArgs<Url, QuerySchema, undefined> : RequestSchema extends ZodType ? EndpointFunctionArgs<Url, undefined, RequestSchema> : EndpointFunctionArgs<Url, undefined, undefined>, reply: any) => Promise<void>>;
/**
 * Legacy-compatible Stream decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The stream endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
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
}): <T extends object>(target: T, propertyKey: string | symbol, descriptor: StreamMethodDescriptor<Url, QuerySchema, RequestSchema>) => StreamMethodDescriptor<Url, QuerySchema, RequestSchema>;

//# sourceMappingURL=stream.decorator.d.mts.map