import type { ClassTypeWithInstance } from '@navios/di';
import type { NaviosModule } from './interfaces/index.mjs';
import type { NaviosApplicationOptions } from './navios.application.mjs';
import { NaviosApplication } from './navios.application.mjs';
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
export declare class NaviosFactory {
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
    static create(appModule: ClassTypeWithInstance<NaviosModule>, options?: NaviosApplicationOptions): Promise<NaviosApplication>;
    private static registerEnvironment;
    private static registerLoggerConfiguration;
}
//# sourceMappingURL=navios.factory.d.mts.map