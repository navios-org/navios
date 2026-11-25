import { env } from 'node:process'

import type { InjectionToken } from '@navios/di'

import { provideConfig } from './provide-config.mjs'

import type { ConfigService } from './config-service.mjs'

/**
 * A `ConfigService` holding a snapshot of `process.env`, taken when a
 * container first resolves it.
 */
export const EnvConfigProvider: InjectionToken<
  ConfigService<Record<string, string | undefined>>,
  undefined
> = provideConfig<Record<string, string | undefined>>({
  name: 'EnvConfig',
  load: () => ({ ...env }),
})
