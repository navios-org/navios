import type { Path, PathValue } from './config-path.mjs'

/**
 * Service for managing application configuration with type-safe access.
 *
 * Provides methods to access configuration values using dot-notation paths
 * with full TypeScript type inference. `provideConfig()` gives the token of
 * one; `new ConfigService({ ... })` is what a test provides for it.
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
 * export const AppConfig = provideConfig<AppConfig>({ load: () => readConfig() })
 *
 * @Injectable()
 * export class DatabaseService {
 *   private config = inject(AppConfig)
 *
 *   connect() {
 *     const host = this.config.getOrThrow('database.host')
 *     const port = this.config.getOrDefault('database.port', 5432)
 *     // host is typed as string, port is typed as number
 *   }
 * }
 * ```
 */
export class ConfigService<Config extends object = Record<string, unknown>> {
  /**
   * Creates a new ConfigService instance.
   *
   * @param config - The configuration object
   */
  constructor(private readonly config: Config = {} as Config) {}

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
  get<Key extends Path<Config>>(key: Key): NonNullable<PathValue<Config, Key>> | null {
    let value: any = this.config
    for (const part of String(key).split('.')) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return null
      }
      value = value[part]
    }
    return (value as NonNullable<PathValue<Config, Key>>) ?? null
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
    defaultValue: NonNullable<PathValue<Config, Key>>,
  ): NonNullable<PathValue<Config, Key>> {
    return this.get(key) ?? defaultValue
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
  getOrThrow<Key extends Path<Config>>(
    key: Key,
    errorMessage?: string,
  ): NonNullable<PathValue<Config, Key>> {
    const value = this.get(key)
    if (value === null) {
      throw new Error(errorMessage || `Configuration value for key "${String(key)}" is not defined`)
    }
    return value
  }
}
