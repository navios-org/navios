/**
 * Legacy-compatible HttpCode decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param code - The HTTP status code to return (e.g., 201, 204, 202)
 * @returns A method decorator compatible with legacy decorator API
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
export declare function HttpCode(code: number): <T extends object>(target: T, propertyKey: string | symbol, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=http-code.decorator.d.mts.map