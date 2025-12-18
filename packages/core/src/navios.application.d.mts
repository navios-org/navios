import type { ClassTypeWithInstance } from '@navios/di';
import { Container } from '@navios/di';
import type { AbstractHttpListenOptions, NaviosModule } from './interfaces/index.mjs';
import type { LoggerService, LogLevel } from './logger/index.mjs';
import type { NaviosEnvironmentOptions } from './navios.environment.mjs';
/**
 * Options for configuring the Navios application context.
 * These options control dependency injection and logging behavior.
 */
export interface NaviosApplicationContextOptions {
    /**
     * Specifies the logger to use. Pass `false` to turn off logging.
     *
     * - `LoggerService` instance: Use a custom logger implementation
     * - `LogLevel[]`: Enable specific log levels (e.g., ['error', 'warn', 'log'])
     * - `false`: Disable logging completely
     */
    logger?: LoggerService | LogLevel[] | false;
    /**
     * Specifies a custom container to use. Useful for testing.
     * If not provided, a new Container will be created.
     */
    container?: Container;
}
/**
 * Complete options for creating a Navios application.
 * Extends NaviosApplicationContextOptions with adapter configuration.
 */
export interface NaviosApplicationOptions extends NaviosApplicationContextOptions {
    /**
     * HTTP adapter environment(s) to use for the application.
     * Can be a single adapter or an array of adapters.
     *
     * @example
     * ```typescript
     * adapter: defineFastifyEnvironment()
     * // or
     * adapter: [defineFastifyEnvironment(), defineBunEnvironment()]
     * ```
     */
    adapter: NaviosEnvironmentOptions | NaviosEnvironmentOptions[];
}
/**
 * Main application class for Navios.
 *
 * This class represents a Navios application instance and provides methods
 * for initializing, configuring, and managing the HTTP server.
 *
 * @example
 * ```typescript
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * app.setGlobalPrefix('/api')
 * app.enableCors({ origin: ['http://localhost:3000'] })
 * await app.init()
 * await app.listen({ port: 3000, host: '0.0.0.0' })
 * ```
 */
export declare class NaviosApplication {
    private environment;
    private moduleLoader;
    private httpApplication;
    private logger;
    protected container: Container;
    private appModule;
    private options;
    /**
     * Indicates whether the application has been initialized.
     * Set to `true` after `init()` completes successfully.
     */
    isInitialized: boolean;
    /**
     * Sets up the application with the provided module and options.
     * This is called automatically by NaviosFactory.create().
     *
     * @param appModule - The root application module
     * @param options - Application configuration options
     * @internal
     */
    setup(appModule: ClassTypeWithInstance<NaviosModule>, options?: NaviosApplicationOptions): Promise<void>;
    /**
     * Gets the dependency injection container used by this application.
     *
     * @returns The Container instance
     */
    getContainer(): Container;
    /**
     * Initializes the application.
     *
     * This method:
     * - Loads all modules and their dependencies
     * - Sets up the HTTP server if an adapter is configured
     * - Calls onModuleInit hooks on all modules
     * - Marks the application as initialized
     *
     * Must be called before `listen()`.
     *
     * @throws Error if app module is not set
     *
     * @example
     * ```typescript
     * const app = await NaviosFactory.create(AppModule, {
     *   adapter: defineFastifyEnvironment(),
     * })
     * await app.init()
     * await app.listen({ port: 3000 })
     * ```
     */
    init(): Promise<void>;
    private initModules;
    /**
     * Enables CORS (Cross-Origin Resource Sharing) for the application.
     *
     * @param options - CORS configuration options (adapter-specific)
     * @throws Error if HTTP application is not set
     *
     * @example
     * ```typescript
     * app.enableCors({
     *   origin: ['http://localhost:3000', 'https://example.com'],
     *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
     *   credentials: true,
     * })
     * ```
     */
    enableCors(options: any): void;
    /**
     * Enables multipart/form-data support for file uploads.
     *
     * @param options - Multipart configuration options (adapter-specific)
     * @throws Error if HTTP application is not set
     *
     * @example
     * ```typescript
     * app.enableMultipart({
     *   limits: {
     *     fileSize: 1024 * 1024 * 10, // 10MB
     *   },
     * })
     * ```
     */
    enableMultipart(options: any): void;
    /**
     * Sets a global prefix for all routes.
     *
     * @param prefix - The prefix to prepend to all route URLs (e.g., '/api')
     * @throws Error if HTTP application is not set
     *
     * @example
     * ```typescript
     * app.setGlobalPrefix('/api/v1')
     * // All routes will be prefixed with /api/v1
     * ```
     */
    setGlobalPrefix(prefix: string): void;
    /**
     * Gets the underlying HTTP server instance.
     *
     * The type of the returned server depends on the adapter used:
     * - Fastify adapter: Returns FastifyInstance
     * - Bun adapter: Returns Bun.Server
     *
     * @returns The HTTP server instance
     * @throws Error if HTTP application is not set
     *
     * @example
     * ```typescript
     * const server = app.getServer()
     * // Use adapter-specific server methods
     * ```
     */
    getServer(): any;
    /**
     * Starts the HTTP server and begins listening for requests.
     *
     * @param options - Listen options (port, host, etc.)
     * @throws Error if HTTP application is not set
     *
     * @example
     * ```typescript
     * await app.listen({ port: 3000, host: '0.0.0.0' })
     * ```
     */
    listen(options: AbstractHttpListenOptions): Promise<void>;
    /**
     * Disposes of application resources.
     *
     * Cleans up the HTTP server and module loader.
     * This method is called automatically by `close()`.
     */
    dispose(): Promise<void>;
    /**
     * Closes the application and cleans up all resources.
     *
     * This is an alias for `dispose()`.
     *
     * @example
     * ```typescript
     * // Graceful shutdown
     * process.on('SIGTERM', async () => {
     *   await app.close()
     *   process.exit(0)
     * })
     * ```
     */
    close(): Promise<void>;
}
//# sourceMappingURL=navios.application.d.mts.map