import type { HttpHeader } from '../../interfaces/index.mjs';
/**
 * Legacy-compatible Header decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param name - The header name (e.g., 'Content-Type', 'Cache-Control')
 * @param value - The header value (string, number, or array of strings)
 * @returns A method decorator compatible with legacy decorator API
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
export declare function Header(name: HttpHeader, value: string | number | string[]): <T extends object>(target: T, propertyKey: string | symbol, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=header.decorator.d.mts.map