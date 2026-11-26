import { InjectionToken, registerProvider } from '@navios/di'

import type { InferOutput, StandardSchemaV1 } from '@navios/di'

import { validateNow } from '../internal/validate-now.mjs'

import { ConfigService } from './config-service.mjs'
import { describeIssue } from './describe-issue.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ConfigProviderOptions<ConfigMap extends object> {
  /** Names the token, for errors. @default 'Config' */
  name?: string
  /** Loads the raw configuration. */
  load: () => ConfigMap | Promise<ConfigMap>
}

export interface ValidatedConfigProviderOptions<Schema extends StandardSchemaV1> {
  /** Names the token, for errors. @default 'Config' */
  name?: string
  /** Loads the raw configuration. */
  load: () => unknown
  /**
   * Validates what `load` returned and types the service. Must validate
   * synchronously.
   */
  schema: Schema
}

/**
 * The configuration to use, out of what was loaded. Its errors say what is
 * wrong and carry no value: they end up in logs, and a configuration holds
 * secrets.
 */
function checked(name: string, schema: StandardSchemaV1 | undefined, loaded: unknown): object {
  let config = loaded
  if (schema) {
    const result = validateNow(
      schema,
      loaded,
      `[Navios] The schema of the configuration ${name} must validate synchronously.`,
    )
    if (result.issues) {
      throw new Error(
        `[Navios] Invalid configuration ${name}: ` +
          result.issues.map((issue) => describeIssue(issue, loaded)).join('; '),
      )
    }
    config = result.value
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error(`[Navios] The configuration ${name} must be an object.`)
  }
  return config
}

/**
 * Creates the token of a `ConfigService` whose content comes from `load`,
 * called once per container. With a `schema`, the loaded value is validated
 * and the service is typed from the schema's output.
 */
export function provideConfig<Schema extends StandardSchemaV1<any, object>>(
  options: ValidatedConfigProviderOptions<Schema>,
): InjectionToken<ConfigService<InferOutput<Schema>>, undefined>
export function provideConfig<ConfigMap extends object>(
  options: ConfigProviderOptions<ConfigMap>,
): InjectionToken<ConfigService<ConfigMap>, undefined>
export function provideConfig(options: {
  name?: string
  load: () => unknown
  schema?: StandardSchemaV1
}): InjectionToken<ConfigService<any>, undefined> {
  const name = options.name ?? 'Config'
  const serve = (loaded: unknown) => new ConfigService(checked(name, options.schema, loaded))
  const token = InjectionToken.create<ConfigService<any>>(name)
  registerProvider(token, {
    factory: () => {
      // A configuration that is there at once can be used synchronously.
      const loaded = options.load() as PromiseLike<unknown> | null | undefined
      return typeof loaded?.then === 'function'
        ? Promise.resolve(loaded).then(serve)
        : serve(loaded)
    },
  })
  return token
}
