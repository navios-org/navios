import { inject, InjectionToken, registerInjectable } from '@navios/di'

import { schemaFromGuard } from '../internal/schema-from-guard.mjs'
import { Logger } from '../logger/index.mjs'

import type { Path, PathValue } from './config-path.mjs'

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
  getConfig: () => Config
  /**
   * Gets a configuration value by key path. Returns `null` if not found.
   *
   * @param key - Dot-separated path to the configuration value (e.g., 'database.host')
   * @returns The configuration value or `null` if not found
   */
  get: <Key extends Path<Config>>(key: Key) => PathValue<Config, Key> | null

  /**
   * Gets a configuration value by key path, or returns a default value if not found.
   *
   * @param key - Dot-separated path to the configuration value
   * @param defaultValue - Default value to return if the key is not found
   * @returns The configuration value or the default value
   */
  getOrDefault: <Key extends Path<Config>>(
    key: Key,
    defaultValue: PathValue<Config, Key>,
  ) => PathValue<Config, Key>

  /**
   * Gets a configuration value by key path, or throws an error if not found.
   *
   * @param key - Dot-separated path to the configuration value
   * @param errorMessage - Optional custom error message
   * @returns The configuration value
   * @throws Error if the key is not found
   */
  getOrThrow: <Key extends Path<Config>>(key: Key, errorMessage?: string) => PathValue<Config, Key>
}

/**
 * Schema for validating configuration service options.
 */
export type ConfigServiceOptions = Record<string, unknown>

export const ConfigServiceOptionsSchema = schemaFromGuard<ConfigServiceOptions>(
  (value): value is ConfigServiceOptions =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
  'Configuration must be an object',
)
/**
 * Type for configuration service options.
 */

/**
 * Injection token for ConfigService.
 */
export const ConfigServiceToken = InjectionToken.create<
  ConfigServiceInterface,
  typeof ConfigServiceOptionsSchema
>(Symbol.for('ConfigService'), ConfigServiceOptionsSchema)

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
export class ConfigService<
  Config extends ConfigServiceOptions = Record<string, unknown>,
> implements ConfigServiceInterface<Config> {
  private readonly logger = inject(Logger, {
    context: ConfigService.name,
  })

  /**
   * Creates a new ConfigService instance.
   *
   * @param config - The configuration object
   */
  constructor(private config: Config = {} as Config) {}

  /**
   * Gets the entire configuration object.
   *
   * @returns The complete configuration object
   */
  getConfig(): Config {
    return this.config
  }

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
  get<Key extends Path<Config>>(key: Key): PathValue<Config, Key> | null {
    try {
      const parts = String(key).split('.')
      let value: any = this.config

      for (const part of parts) {
        if (value === null || value === undefined || typeof value !== 'object') {
          return null
        }
        value = value[part]
      }

      return (value as PathValue<Config, Key>) ?? null
    } catch (error) {
      this.logger.debug?.(`Failed to get config value for key ${String(key)}`, error)
      return null
    }
  }

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
  getOrDefault<Key extends Path<Config>>(
    key: Key,
    defaultValue: PathValue<Config, Key>,
  ): PathValue<Config, Key> {
    const value = this.get(key)
    return value !== null ? value : defaultValue
  }

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
  getOrThrow<Key extends Path<Config>>(key: Key, errorMessage?: string): PathValue<Config, Key> {
    const value = this.get(key)

    if (value === null) {
      const message = errorMessage || `Configuration value for key "${String(key)}" is not defined`
      this.logger.error(message)
      throw new Error(message)
    }

    return value
  }
}

registerInjectable(ConfigService, { token: ConfigServiceToken })
