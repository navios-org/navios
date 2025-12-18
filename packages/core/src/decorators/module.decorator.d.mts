import type { ClassType } from '@navios/di';
/**
 * Options for configuring a Navios module.
 */
export interface ModuleOptions {
    /**
     * Controllers to register in this module.
     * Controllers handle HTTP requests and define endpoints.
     */
    controllers?: ClassType[] | Set<ClassType>;
    /**
     * Other modules to import into this module.
     * Imported modules' controllers and services become available.
     */
    imports?: ClassType[] | Set<ClassType>;
    /**
     * Guards to apply to all controllers in this module.
     * Guards are executed in reverse order (last guard first).
     */
    guards?: ClassType[] | Set<ClassType>;
}
/**
 * Decorator that marks a class as a Navios module.
 *
 * Modules are the basic building blocks of a Navios application.
 * They organize controllers, services, and other modules into logical units.
 *
 * @param options - Module configuration options
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @Module({
 *   controllers: [UserController, AuthController],
 *   imports: [DatabaseModule],
 *   guards: [AuthGuard],
 * })
 * export class AppModule {}
 * ```
 */
export declare function Module({ controllers, imports, guards }?: ModuleOptions): (target: ClassType, context: ClassDecoratorContext) => ClassType;
//# sourceMappingURL=module.decorator.d.mts.map