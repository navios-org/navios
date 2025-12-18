import type { BaseEndpointConfig, EndpointFunctionArgs, HttpMethod } from '@navios/builder';
import type { z, ZodType } from 'zod/v4';
/**
 * Type helper to constrain a PropertyDescriptor's value to match an endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type EndpointMethodDescriptor<Url extends string, QuerySchema, RequestSchema, ResponseSchema extends ZodType> = TypedPropertyDescriptor<(params: QuerySchema extends ZodType ? RequestSchema extends ZodType ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true> : EndpointFunctionArgs<Url, QuerySchema, undefined, true> : RequestSchema extends ZodType ? EndpointFunctionArgs<Url, undefined, RequestSchema, true> : EndpointFunctionArgs<Url, undefined, undefined, true>) => Promise<z.input<ResponseSchema>>>;
/**
 * Legacy-compatible Endpoint decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser(request: EndpointParams<typeof getUserEndpoint>): EndpointResult<typeof getUserEndpoint> {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export declare function Endpoint<Method extends HttpMethod = HttpMethod, Url extends string = string, QuerySchema = undefined, ResponseSchema extends ZodType = ZodType, RequestSchema = ZodType>(endpoint: {
    config: BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema>;
}): (target: any, propertyKey: string | symbol, descriptor: EndpointMethodDescriptor<Url, QuerySchema, RequestSchema, ResponseSchema>) => PropertyDescriptor | void;

//# sourceMappingURL=endpoint.decorator.d.mts.map