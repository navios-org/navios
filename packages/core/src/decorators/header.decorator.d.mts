import type { HttpHeader } from '../interfaces/index.mjs';
/**
 * Decorator that sets a custom HTTP response header for an endpoint.
 *
 * @param name - The header name (e.g., 'Content-Type', 'Cache-Control')
 * @param value - The header value (string, number, or array of strings)
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   @Header('Cache-Control', 'max-age=3600')
 *   async getUser() {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export declare function Header(name: HttpHeader, value: string | number | string[]): <T extends Function>(target: T, context: ClassMethodDecoratorContext) => T;
//# sourceMappingURL=header.decorator.d.mts.map