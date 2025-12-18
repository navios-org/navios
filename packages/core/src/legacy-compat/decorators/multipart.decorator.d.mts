import type { BaseEndpointConfig, EndpointFunctionArgs, HttpMethod } from '@navios/builder';
import type { z, ZodObject, ZodType } from 'zod/v4';
/**
 * Type helper to constrain a PropertyDescriptor's value to match a multipart endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type MultipartMethodDescriptor<Url extends string, QuerySchema, RequestSchema, ResponseSchema extends ZodType> = TypedPropertyDescriptor<(params: QuerySchema extends ZodObject ? RequestSchema extends ZodType ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema> : EndpointFunctionArgs<Url, QuerySchema, undefined> : RequestSchema extends ZodType ? EndpointFunctionArgs<Url, undefined, RequestSchema> : EndpointFunctionArgs<Url, undefined, undefined>) => Promise<z.input<ResponseSchema>>>;
/**
 * Legacy-compatible Multipart decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The multipart endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller()
 * export class FileController {
 *   @Multipart(uploadFileEndpoint)
 *   async uploadFile(request: MultipartParams<typeof uploadFileEndpoint>): MultipartResult<typeof uploadFileEndpoint> {
 *     const { file } = request.data
 *     return { url: 'https://example.com/file.jpg' }
 *   }
 * }
 * ```
 */
export declare function Multipart<Method extends HttpMethod = HttpMethod, Url extends string = string, QuerySchema = undefined, ResponseSchema extends ZodType = ZodType, RequestSchema = ZodType>(endpoint: {
    config: BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema>;
}): <T extends object>(target: T, propertyKey: string | symbol, descriptor: MultipartMethodDescriptor<Url, QuerySchema, RequestSchema, ResponseSchema>) => PropertyDescriptor | void;

//# sourceMappingURL=multipart.decorator.d.mts.map