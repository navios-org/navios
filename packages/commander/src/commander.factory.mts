import type { ClassTypeWithInstance, NaviosModule } from '@navios/core'

import { Container } from '@navios/core'

import type { CommanderApplicationOptions } from './commander.application.mjs'

import { CommanderApplication } from './commander.application.mjs'

/**
 * Factory class for creating and configuring CLI applications.
 *
 * @example
 * ```typescript
 * import { CommanderFactory } from '@navios/commander'
 * import { AppModule } from './app.module'
 *
 * async function bootstrap() {
 *   const app = await CommanderFactory.create(AppModule)
 *   await app.init()
 *   await app.run(process.argv)
 *   await app.close()
 * }
 * ```
 */
export class CommanderFactory {
  /**
   * Creates a new CommanderApplication instance and configures it with the provided module.
   *
   * @param appModule - The root CLI module class that contains commands and/or imports other modules
   * @param options - Optional configuration options for the application
   * @returns A promise that resolves to a configured CommanderApplication instance
   *
   * @example
   * ```typescript
   * const app = await CommanderFactory.create(AppModule)
   * await app.init()
   * ```
   */
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: CommanderApplicationOptions = {},
  ) {
    const container = new Container()
    const app = await container.get(CommanderApplication)
    await app.setup(appModule, options)
    return app
  }
}
