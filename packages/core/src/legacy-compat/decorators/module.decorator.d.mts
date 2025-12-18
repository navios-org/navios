import type { ClassType } from '@navios/di';
import { type ModuleOptions } from '../../decorators/module.decorator.mjs';
/**
 * Legacy-compatible Module decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param options - Module configuration options
 * @returns A class decorator compatible with legacy decorator API
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
export declare function Module(options?: ModuleOptions): (target: ClassType) => ClassType;
//# sourceMappingURL=module.decorator.d.mts.map