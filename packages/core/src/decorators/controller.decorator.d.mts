import type { ClassType } from '@navios/di';
/**
 * Options for configuring a Navios controller.
 */
export interface ControllerOptions {
    /**
     * Guards to apply to all endpoints in this controller.
     * Guards are executed in reverse order (last guard first).
     */
    guards?: ClassType[] | Set<ClassType>;
}
/**
 * Decorator that marks a class as a Navios controller.
 *
 * Controllers handle HTTP requests and define endpoints.
 * They are request-scoped by default, meaning a new instance is created for each request.
 *
 * @param options - Controller configuration options
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @Controller({ guards: [AuthGuard] })
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *     // Handle request
 *   }
 * }
 * ```
 */
export declare function Controller({ guards }?: ControllerOptions): (target: ClassType, context: ClassDecoratorContext) => ClassType;
//# sourceMappingURL=controller.decorator.d.mts.map