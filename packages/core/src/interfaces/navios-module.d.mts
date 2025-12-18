/**
 * Interface that all Navios modules must implement.
 *
 * Modules decorated with @Module() should implement this interface to receive
 * lifecycle hooks.
 *
 * @example
 * ```typescript
 * @Module({
 *   controllers: [UserController],
 * })
 * export class AppModule implements NaviosModule {
 *   async onModuleInit() {
 *     console.log('AppModule initialized')
 *     // Perform initialization logic
 *   }
 * }
 * ```
 */
export interface NaviosModule {
    /**
     * Optional lifecycle hook called after the module is initialized.
     *
     * This is called after all modules are loaded and the HTTP server is set up
     * (if an adapter is configured), but before the server starts listening.
     */
    onModuleInit?: () => Promise<void> | void;
}
//# sourceMappingURL=navios-module.d.mts.map