import { FactoryInjectionToken } from '@navios/di';
import { z } from 'zod/v4';
import type { ConfigServiceOptions } from './config.service.mjs';
import { ConfigService, ConfigServiceOptionsSchema } from './config.service.mjs';
/**
 * Schema for configuration provider options.
 */
export declare const ConfigProviderOptions: z.ZodObject<{
    load: z.ZodFunction<z.core.$ZodFunctionArgs, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
/**
 * Creates a factory injection token for ConfigService that loads configuration asynchronously.
 *
 * Use this when you need to load configuration from a file, database, or other async source.
 *
 * @param options - Configuration provider options
 * @param options.load - Async function that loads and returns the configuration object
 * @returns A factory injection token for ConfigService
 *
 * @example
 * ```typescript
 * const MyConfigService = provideConfig({
 *   load: async () => {
 *     const config = await loadConfigFromFile('config.json')
 *     return config
 *   },
 * })
 *
 * // Use in module setup
 * container.bind(ConfigServiceToken).toFactory(configProvider)
 * ```
 */
export declare function provideConfig<ConfigMap extends ConfigServiceOptions>(options: z.input<typeof ConfigProviderOptions>): FactoryInjectionToken<ConfigService<ConfigMap>, typeof ConfigServiceOptionsSchema>;
/**
 * Pre-configured ConfigService provider that uses environment variables.
 *
 * Provides a ConfigService instance bound to `process.env`.
 *
 * @example
 * ```typescript
 * // Use environment variables as configuration
 * container.bind(ConfigServiceToken).toValue(EnvConfigProvider)
 * ```
 */
export declare const EnvConfigProvider: import("@navios/di").BoundInjectionToken<ConfigService<Record<string, string>>, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
//# sourceMappingURL=config.provider.d.mts.map