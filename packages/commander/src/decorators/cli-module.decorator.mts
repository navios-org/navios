import type { ClassType, Registry } from '@navios/core'

import { Injectable, InjectableScope, InjectionToken } from '@navios/core'

import { getCliModuleMetadata } from '../metadata/index.mjs'

/**
 * Options for the `@CliModule` decorator.
 *
 * @public
 */
export interface CliModuleOptions {
  /**
   * Array or Set of command classes to register in this module.
   * Commands must be decorated with `@Command`.
   */
  commands?: ClassType[] | Set<ClassType>
  /**
   * Array or Set of other CLI modules to import.
   * Imported modules' commands will be available in this module.
   */
  imports?: ClassType[] | Set<ClassType>
  /**
   * Priority level for the module.
   * Higher priority modules will be loaded first.
   */
  priority?: number
  /**
   * Registry to use for the module.
   * Registry is used to store the module and its commands.
   */
  registry?: Registry
}

/**
 * Decorator that marks a class as a CLI module.
 *
 * Modules organize commands and can import other modules to compose larger CLI applications.
 * The module can optionally implement `NaviosModule` interface for lifecycle hooks.
 *
 * @param options - Configuration options for the module
 * @returns A class decorator function
 *
 * @example
 * ```typescript
 * import { CliModule } from '@navios/commander'
 * import { GreetCommand } from './greet.command'
 * import { UserModule } from './user.module'
 *
 * @CliModule({
 *   commands: [GreetCommand],
 *   imports: [UserModule]
 * })
 * export class AppModule {}
 * ```
 */
export function CliModule(
  { commands = [], imports = [], priority, registry }: CliModuleOptions = {
    commands: [],
    imports: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios Commander] @CliModule decorator can only be used on classes.',
      )
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
    const moduleMetadata = getCliModuleMetadata(target, context)
    for (const command of commands) {
      moduleMetadata.commands.add(command)
    }
    for (const importedModule of imports) {
      moduleMetadata.imports.add(importedModule)
    }

    return Injectable({
      token,
      scope: InjectableScope.Singleton,
      priority,
      registry,
    })(target, context)
  }
}
