import type { Path, PathValue } from './types.mjs';
/**
 * Interface for configuration service implementations.
 *
 * Provides type-safe access to configuration values with support for nested paths.
 *
 * @typeParam Config - The configuration object type
 */
export interface ConfigServiceInterface<Config = Record<string, unknown>> {
    /**
     * Gets the entire configuration object.
     */
    getConfig: () => Config;
    /**
     * Gets a configuration value by key path. Returns `null` if not found.
     *
     * @param key - Dot-separated path to the configuration value (e.g., 'database.host')
     * @returns The configuration value or `null` if not found
     */
    get: <Key extends Path<Config>>(key: Key) => PathValue<Config, Key> | null;
    /**
     * Gets a configuration value by key path, or returns a default value if not found.
     *
     * @param key - Dot-separated path to the configuration value
     * @param defaultValue - Default value to return if the key is not found
     * @returns The configuration value or the default value
     */
    getOrDefault: <Key extends Path<Config>>(key: Key, defaultValue: PathValue<Config, Key>) => PathValue<Config, Key>;
    /**
     * Gets a configuration value by key path, or throws an error if not found.
     *
     * @param key - Dot-separated path to the configuration value
     * @param errorMessage - Optional custom error message
     * @returns The configuration value
     * @throws Error if the key is not found
     */
    getOrThrow: <Key extends Path<Config>>(key: Key, errorMessage?: string) => PathValue<Config, Key>;
}
//# sourceMappingURL=config-service.interface.d.mts.map