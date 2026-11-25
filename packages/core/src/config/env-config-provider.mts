import { env } from 'node:process'

import { InjectionToken } from '@navios/di'

import type { BoundInjectionToken } from '@navios/di'

import { ConfigServiceToken } from './config-service.mjs'

import type { ConfigService, ConfigServiceOptionsSchema } from './config-service.mjs'

/**
 * A `ConfigService` holding a snapshot of `process.env`, taken at import.
 */
export const EnvConfigProvider: BoundInjectionToken<
  ConfigService<Record<string, string | undefined>>,
  typeof ConfigServiceOptionsSchema
> = InjectionToken.bound(ConfigServiceToken as InjectionToken<any, any>, { ...env })
