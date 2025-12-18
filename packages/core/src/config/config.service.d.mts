import { InjectionToken } from '@navios/di';
import { z } from 'zod/v4';
import type { ConfigServiceInterface as IConfigService } from './config-service.interface.mjs';
import type { Path, PathValue } from './types.mjs';
/**
 * Schema for validating configuration service options.
 */
export declare const ConfigServiceOptionsSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
/**
 * Type for configuration service options.
 */
export type ConfigServiceOptions = z.infer<typeof ConfigServiceOptionsSchema>;
/**
 * Injection token for ConfigService.
 */
export declare const ConfigServiceToken: InjectionToken<IConfigService<Record<string, unknown>>, z.ZodRecord<z.ZodString, z.ZodUnknown>, true>;
/**
 * Service for managing application configuration with type-safe access.
 *
 * Provides methods to access configuration values using dot-notation paths
 * with full TypeScript type inference.
 *
 * @typeParam Config - The configuration object type
 *
 * @example
 * ```typescript
 * interface AppConfig {
 *   database: {
 *     host: string
 *     port: number
 *   }
 *   api: {
 *     timeout: number
 *   }
 * }
 *
 * @Injectable()
 * export class DatabaseService {
 *   private config = inject(MyConfigService)
 *
 *   connect() {
 *     const host = this.config.getOrThrow('database.host')
 *     const port = this.config.getOrDefault('database.port', 5432)
 *     // host is typed as string, port is typed as number
 *   }
 * }
 * ```
 */
export declare class ConfigService<Config extends ConfigServiceOptions = Record<string, unknown>> implements IConfigService<Config> {
    private config;
    private readonly logger;
    /**
     * Creates a new ConfigService instance.
     *
     * @param config - The configuration object
     */
    constructor(config?: Config);
    /**
     * Gets the entire configuration object.
     *
     * @returns The complete configuration object
     */
    getConfig(): Config;
    /**
     * Gets a configuration value by key path.
     *
     * Returns `null` if the key is not found or if any part of the path is invalid.
     *
     * @param key - Dot-separated path to the configuration value (e.g., 'database.host')
     * @returns The configuration value or `null` if not found
     *
     * @example
     * ```typescript
     * const host = config.get('database.host') // string | null
     * const port = config.get('database.port') // number | null
     * ```
     */
    get<Key extends Path<Config>>(key: Key): PathValue<Config, Key> | null;
    /**
     * Gets a configuration value by key path, or returns a default value if not found.
     *
     * @param key - Dot-separated path to the configuration value
     * @param defaultValue - Default value to return if the key is not found
     * @returns The configuration value or the default value
     *
     * @example
     * ```typescript
     * const port = config.getOrDefault('database.port', 5432) // number
     * ```
     */
    getOrDefault<Key extends Path<Config>>(key: Key, defaultValue: PathValue<Config, Key>): PathValue<Config, Key>;
    /**
     * Gets a configuration value by key path, or throws an error if not found.
     *
     * @param key - Dot-separated path to the configuration value
     * @param errorMessage - Optional custom error message
     * @returns The configuration value
     * @throws Error if the key is not found
     *
     * @example
     * ```typescript
     * const host = config.getOrThrow('database.host') // string (throws if not found)
     * const apiKey = config.getOrThrow('api.key', 'API key is required') // string
     * ```
     */
    getOrThrow<Key extends Path<Config>>(key: Key, errorMessage?: string): PathValue<Config, Key>;
}
//# sourceMappingURL=config.service.d.mts.map