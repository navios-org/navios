import type { ClassType } from '@navios/di';
import type { ControllerOptions } from '../../decorators/controller.decorator.mjs';
/**
 * Legacy-compatible Controller decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param options - Controller configuration options
 * @returns A class decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller({ guards: [AuthGuard] })
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser() { }
 * }
 * ```
 */
export declare function Controller(options?: ControllerOptions): (target: ClassType) => ClassType;
//# sourceMappingURL=controller.decorator.d.mts.map