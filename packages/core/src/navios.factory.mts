import type {
  AnyInjectableType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'

import { Container } from '@navios/di'

import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'

import { ConsoleLogger, isNil, LoggerOutput } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'
import { NaviosEnvironment } from './navios.environment.mjs'
import { setRequestIdEnabled } from './stores/index.mjs'
import { NaviosOptionsToken } from './tokens/index.mjs'

/**
 * Factory class for creating and configuring Navios applications.
 *
 * This is the main entry point for bootstrapping a Navios application.
 * It handles dependency injection container setup, adapter registration,
 * and logger configuration.
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineFastifyEnvironment } from '@navios/adapter-fastify'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 *   logger: ['log', 'error', 'warn'],
 * })
 *
 * await app.init()
 * await app.listen({ port: 3000 })
 * ```
 */
export class NaviosFactory {
  /**
   * Creates a new Navios application instance.
   *
   * This method sets up the dependency injection container, registers the HTTP adapter,
   * configures logging, and initializes the application with the provided module.
   *
   * @param appModule - The root application module class decorated with @Module()
   * @param options - Configuration options for the application
   * @param options.adapter - HTTP adapter environment (required for HTTP server functionality)
   * @param options.logger - Logger configuration. Can be:
   *   - A LoggerService instance for custom logging
   *   - An array of LogLevel strings to enable specific log levels
   *   - `false` to disable logging
   * @param options.container - Optional custom dependency injection container (useful for testing)
   * @returns A configured NaviosApplication instance ready to be initialized
   *
   * @example
   * ```typescript
   * // Basic setup with Fastify adapter
   * const app = await NaviosFactory.create(AppModule, {
   *   adapter: defineFastifyEnvironment(),
   * })
   *
   * // With custom logger configuration
   * const app = await NaviosFactory.create(AppModule, {
   *   adapter: defineFastifyEnvironment(),
   *   logger: ['error', 'warn', 'log'],
   * })
   *
   * // With custom container for testing
   * const container = new Container()
   * const app = await NaviosFactory.create(AppModule, {
   *   adapter: defineFastifyEnvironment(),
   *   container,
   * })
   * ```
   */
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {
      adapter: [],
    },
  ) {
    const container = options.container ?? new Container()

    // Set request ID flag early, before any adapters are registered
    if (options.enableRequestId === true) {
      setRequestIdEnabled(true)
    }

    // Store options in container for DI access by adapters
    container.addInstance(NaviosOptionsToken, options)

    await this.registerLoggerConfiguration(container, options)
    const adapters = Array.isArray(options.adapter)
      ? options.adapter
      : [options.adapter]
    for (const adapter of adapters) {
      await this.registerEnvironment(container, adapter)
    }
    const app = await container.get(NaviosApplication)
    await app.setup(appModule, options)
    return app
  }

  private static async registerEnvironment(
    container: Container,
    environment: {
      httpTokens?: Map<InjectionToken<any, undefined>, AnyInjectableType>
    } = {},
  ) {
    const naviosEnvironment = await container.get(NaviosEnvironment)
    const { httpTokens } = environment
    if (httpTokens) {
      naviosEnvironment.setupHttpEnvironment(httpTokens)
    }
  }

  private static async registerLoggerConfiguration(
    container: Container,
    options: NaviosApplicationOptions,
  ) {
    const { logger } = options
    if (Array.isArray(logger) || isNil(logger) || options.enableRequestId) {
      const loggerInstance = (await container.get(
        LoggerOutput,
      )) as ConsoleLogger
      loggerInstance?.setup({
        logLevels: Array.isArray(logger) ? logger : undefined,
        requestId: options.enableRequestId ?? false,
      })
      return
    }
    if ((logger as boolean) !== true && !isNil(logger)) {
      container.addInstance(LoggerOutput, logger)
    }
  }
}
