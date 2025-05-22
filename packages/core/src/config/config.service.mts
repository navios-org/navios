import { NaviosException } from '@navios/builder'
import { Injectable, InjectionToken, syncInject } from '@navios/di'

import { z } from 'zod'

import type { ConfigServiceInterface as IConfigService } from './config-service.interface.mjs'
import type { Path, PathValue } from './types.mjs'

import { Logger } from '../logger/index.mjs'

export const ConfigServiceOptionsSchema = z.record(z.unknown())
export type ConfigServiceOptions = z.infer<typeof ConfigServiceOptionsSchema>

export const ConfigServiceToken = InjectionToken.create<
  IConfigService,
  typeof ConfigServiceOptionsSchema
>(Symbol.for('ConfigService'), ConfigServiceOptionsSchema)

@Injectable({
  token: ConfigServiceToken,
})
export class ConfigService<
  Config extends ConfigServiceOptions = Record<string, unknown>,
> implements IConfigService<Config>
{
  private readonly logger = syncInject(Logger, {
    context: ConfigService.name,
  })

  constructor(private config: Config = {} as Config) {}

  getConfig(): Config {
    return this.config
  }

  get<Key extends Path<Config>>(key: Key): PathValue<Config, Key> | null {
    try {
      const parts = String(key).split('.')
      let value: any = this.config

      for (const part of parts) {
        if (
          value === null ||
          value === undefined ||
          typeof value !== 'object'
        ) {
          return null
        }
        value = value[part]
      }

      return (value as PathValue<Config, Key>) ?? null
    } catch (error) {
      this.logger.debug?.(
        `Failed to get config value for key ${String(key)}`,
        error,
      )
      return null
    }
  }

  getOrDefault<Key extends Path<Config>>(
    key: Key,
    defaultValue: PathValue<Config, Key>,
  ): PathValue<Config, Key> {
    const value = this.get(key)
    return value !== null ? value : defaultValue
  }

  getOrThrow<Key extends Path<Config>>(
    key: Key,
    errorMessage?: string,
  ): PathValue<Config, Key> {
    const value = this.get(key)

    if (value === null) {
      const message =
        errorMessage ||
        `Configuration value for key "${String(key)}" is not defined`
      this.logger.error(message)
      throw new NaviosException(message)
    }

    return value
  }
}
