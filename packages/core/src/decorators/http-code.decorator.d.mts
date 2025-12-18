/**
 * Decorator that sets a custom HTTP status code for successful responses.
 *
 * By default, endpoints return 200 OK. Use this decorator to return a different status code.
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
export declare function HttpCode(code: number): <T extends Function>(target: T, context: ClassMethodDecoratorContext) => T;
//# sourceMappingURL=http-code.decorator.d.mts.map