import type { ClassTypeWithInstance, InjectionToken } from '@navios/di';
import type { CanActivate } from '../../interfaces/index.mjs';
/**
 * Legacy-compatible UseGuards decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Can be applied to classes or methods.
 *
 * @param guards - Guard classes or injection tokens to apply
 * @returns A class or method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * // Apply to a controller
 * @Controller()
 * @UseGuards(AuthGuard, RoleGuard)
 * export class UserController { }
 *
 * // Apply to a specific endpoint
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   @UseGuards(AuthGuard)
 *   async getUser() { }
 * }
 * ```
 */
export declare function UseGuards(...guards: (ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>)[]): any;
//# sourceMappingURL=use-guards.decorator.d.mts.map