import { env } from 'node:process'

import { InjectionToken, validateSync } from '@navios/di'

import type {
  BoundInjectionToken,
  FactoryInjectionToken,
  InferOutput,
  StandardSchemaV1,
} from '@navios/di'

import { ConfigServiceToken } from './config.service.mjs'

import type {
  ConfigService,
  ConfigServiceOptions,
  ConfigServiceOptionsSchema,
} from './config.service.mjs'

export interface ConfigProviderOptions<ConfigMap extends ConfigServiceOptions> {
  /** Loads the raw configuration. */
  load: () => ConfigMap | Promise<ConfigMap>
}

export interface ValidatedConfigProviderOptions<Schema extends StandardSchemaV1> {
  /** Loads the raw configuration. */
  load: () => unknown | Promise<unknown>
  /**
   * Validates what `load` returned and types the service. Must validate
   * synchronously.
   */
  schema: Schema
}

/**
 * Creates the token for a `ConfigService` whose content comes from `load`.
 * With a `schema`, the loaded value is validated and the service is typed
 * from the schema's output.
 */
export function provideConfig<Schema extends StandardSchemaV1<any, ConfigServiceOptions>>(
  options: ValidatedConfigProviderOptions<Schema>,
): FactoryInjectionToken<ConfigService<InferOutput<Schema>>, typeof ConfigServiceOptionsSchema>
export function provideConfig<ConfigMap extends ConfigServiceOptions>(
  options: ConfigProviderOptions<ConfigMap>,
): FactoryInjectionToken<ConfigService<ConfigMap>, typeof ConfigServiceOptionsSchema>
export function provideConfig(options: {
  load: () => unknown | Promise<unknown>
  schema?: StandardSchemaV1
}): FactoryInjectionToken<any, any> {
  return InjectionToken.factory(ConfigServiceToken as InjectionToken<any, any>, async () => {
    const loaded = await options.load()
    return options.schema ? validateSync(options.schema, loaded, 'ConfigService') : loaded
  })
}

/**
 * A `ConfigService` holding a snapshot of `process.env`, taken at import.
 */
export const EnvConfigProvider: BoundInjectionToken<
  ConfigService<Record<string, string | undefined>>,
  typeof ConfigServiceOptionsSchema
> = InjectionToken.bound(ConfigServiceToken as InjectionToken<any, any>, { ...env })
