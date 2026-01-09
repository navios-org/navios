import type {
  ClassTypeWithInstance,
  LogLevel,
  NaviosApplication,
  NaviosModule,
} from '@navios/core'

import { ConsoleLogger, NaviosFactory } from '@navios/core'

import type { CliEnvironment } from './interfaces/environment.interface.mjs'

import { defineCliEnvironment } from './define-environment.mjs'

/**
 * Logger display options for CLI applications.
 * All options default to false for cleaner CLI output.
 *
 * @public
 */
export interface CommanderLoggerOptions {
  /**
   * Enabled log levels.
   * @default ['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
   */
  logLevels?: LogLevel[]
  /**
   * If true, will print the process ID in the log message.
   * @default false
   */
  showPid?: boolean
  /**
   * If true, will print the log level in the log message.
   * @default true
   */
  showLogLevel?: boolean
  /**
   * If true, will print the prefix/app name in the log message.
   * @default false
   */
  showPrefix?: boolean
  /**
   * If true, will print the context in the log message.
   * @default true
   */
  showContext?: boolean
  /**
   * If true, will print the absolute timestamp in the log message.
   * @default false
   */
  showTimestamp?: boolean
  /**
   * If enabled, will print timestamp difference between current and previous log message.
   * @default false
   */
  showTimeDiff?: boolean
}

/**
 * Configuration options for CommanderFactory.
 *
 * @public
 */
export interface CommanderFactoryOptions {
  /**
   * Logger display options. These override the default CLI-friendly logger settings.
   */
  logger?: CommanderLoggerOptions
}

/**
 * Factory class for creating CLI applications.
 *
 * This is a convenience wrapper around `NaviosFactory.create()` that
 * configures everything needed for CLI usage. It sets up the CLI adapter
 * and returns a typed `NaviosApplication<CliEnvironment>`.
 *
 * @example
 * ```typescript
 * import { CommanderFactory } from '@navios/commander'
 * import { AppModule } from './app.module'
 *
 * async function bootstrap() {
 *   const app = await CommanderFactory.create(AppModule)
 *   await app.init()
 *
 *   const adapter = app.getAdapter()
 *   await adapter.run(process.argv)
 *
 *   await app.close()
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Alternative: use NaviosFactory directly
 * import { NaviosFactory } from '@navios/core'
 * import { defineCliEnvironment, type CliEnvironment } from '@navios/commander'
 *
 * const app = await NaviosFactory.create<CliEnvironment>(AppModule, {
 *   adapter: defineCliEnvironment(),
 * })
 * ```
 */
export class CommanderFactory {
  /**
   * Creates a new CLI application instance configured with the provided module.
   *
   * @param appModule - The root CLI module class decorated with `@CliModule`
   * @param options - Optional configuration options for the CLI application
   * @returns A promise that resolves to a configured NaviosApplication instance
   *
   * @example
   * ```typescript
   * const app = await CommanderFactory.create(AppModule)
   * await app.init()
   *
   * const adapter = app.getAdapter()
   * await adapter.run(process.argv)
   * ```
   */
  static async create<TModule extends NaviosModule = NaviosModule>(
    appModule: ClassTypeWithInstance<TModule>,
    options: CommanderFactoryOptions = {},
  ): Promise<NaviosApplication<CliEnvironment>> {
    const app = await NaviosFactory.create<CliEnvironment>(appModule, {
      adapter: defineCliEnvironment(),
      logger: ConsoleLogger.create({
        logLevels: options.logger?.logLevels,
        showTimeDiff: options.logger?.showTimeDiff ?? false,
        showPid: options.logger?.showPid ?? false,
        showLogLevel: options.logger?.showLogLevel ?? true,
        showPrefix: options.logger?.showPrefix ?? false,
        showContext: options.logger?.showContext ?? true,
        showTimestamp: options.logger?.showTimestamp ?? false,
      }),
    })

    return app
  }
}
