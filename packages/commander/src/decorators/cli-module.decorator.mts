import type { ClassType, Registry } from '@navios/core'

import { Module, getModuleMetadata, getModuleCustomEntry } from '@navios/core'

import {
  CommandEntryKey,
  type CommandEntryValue,
} from '../metadata/command-entry.metadata.mjs'

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
   * Array or Set of controller classes for HTTP endpoints.
   * Allows mixing HTTP and CLI functionality in the same module.
   */
  controllers?: ClassType[] | Set<ClassType>
  /**
   * Array or Set of other modules to import.
   * Imported modules' commands and controllers will be available.
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
 * This decorator extends the standard @Module decorator, adding support for
 * CLI commands while maintaining full compatibility with HTTP controllers.
 * Modules organize commands and can import other modules to compose larger
 * CLI applications.
 *
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
 *
 * @example
 * ```typescript
 * // Mixed HTTP and CLI module
 * @CliModule({
 *   controllers: [HealthController],
 *   commands: [MigrateCommand],
 *   imports: [DatabaseModule],
 * })
 * export class AppModule {}
 * ```
 */
export function CliModule(
  {
    commands = [],
    controllers = [],
    imports = [],
    guards = [],
    overrides = [],
    priority,
    registry,
  }: CliModuleOptions = {
    commands: [],
    controllers: [],
    imports: [],
    guards: [],
    overrides: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios Commander] @CliModule decorator can only be used on classes.',
      )
    }

    // Apply standard @Module decorator first
    const result = Module({
      controllers,
      imports,
      guards,
      overrides,
      priority,
      registry,
    })(target, context)

    // Get the module metadata that @Module just created
    const metadata = getModuleMetadata(target, context)

    // Store commands in customEntries
    const commandSet = getModuleCustomEntry<CommandEntryValue>(
      metadata,
      CommandEntryKey,
      () => new Set(),
    )
    for (const command of commands) {
      commandSet.add(command)
    }

    return result
  }
}
