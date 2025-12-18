import type { ClassTypeWithInstance, InjectionToken } from '@navios/di';
import type { CanActivate } from '../interfaces/index.mjs';
/**
 * Decorator that applies guards to a controller or endpoint.
 *
 * Guards are used for authentication, authorization, and request validation.
 * They implement the `CanActivate` interface and are executed before the endpoint handler.
 * Guards can be applied at the module, controller, or endpoint level.
 *
 * @param guards - Guard classes or injection tokens to apply
 * @returns A class or method decorator
 *
 * @example
 * ```typescript
 * // Apply to a controller
 * @Controller()
 * @UseGuards(AuthGuard, RoleGuard)
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser() { }
 * }
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
export declare function UseGuards(...guards: (ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>)[]): <T extends Function>(target: T, context: ClassMethodDecoratorContext | ClassDecoratorContext) => T;
//# sourceMappingURL=use-guards.decorator.d.mts.map