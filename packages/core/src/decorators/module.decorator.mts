import type { ClassType, Registry } from '@navios/di'

import { Injectable, InjectableScope, InjectionToken } from '@navios/di'

import { getModuleMetadata } from '../metadata/index.mjs'

/**
 * Options for configuring a Navios module.
 */
export interface ModuleOptions {
  /**
   * Controllers to register in this module.
   * Controllers handle HTTP requests and define endpoints.
   */
  controllers?: ClassType[] | Set<ClassType>
  /**
   * Other modules to import into this module.
   * Imported modules' controllers and services become available.
   */
  imports?: ClassType[] | Set<ClassType>
  /**
   * Guards to apply to all controllers in this module.
   * Guards are executed in reverse order (last guard first).
   */
  guards?: ClassType[] | Set<ClassType>
  /**
   * Service override classes to import for side effects.
   * These classes are imported to ensure their @Injectable decorators execute,
   * allowing them to register with the DI system. Overrides should use the same
   * InjectionToken as the original service with a higher priority.
   */
  overrides?: ClassType[] | Set<ClassType>
  /**
   * Priority to use for the module.
   * Priority is used to sort the module in the registry.
   */
  priority?: number
  /**
   * Registry to use for the module.
   * Registry is used to store the module and its controllers.
   */
  registry?: Registry
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
export function Module(
  {
    controllers = [],
    imports = [],
    guards = [],
    overrides = [],
    priority,
    registry,
  }: ModuleOptions = {
    controllers: [],
    imports: [],
    guards: [],
    overrides: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module decorator can only be used on classes.')
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
    const moduleMetadata = getModuleMetadata(target, context)
    for (const controller of controllers) {
      moduleMetadata.controllers.add(controller)
    }
    for (const importedModule of imports) {
      moduleMetadata.imports.add(importedModule)
    }
    for (const guard of Array.from(guards).reverse()) {
      moduleMetadata.guards.add(guard)
    }
    for (const override of overrides) {
      moduleMetadata.overrides.add(override)
    }

    return Injectable({
      token,
      scope: InjectableScope.Singleton,
      priority,
      registry,
    })(target, context)
  }
}
