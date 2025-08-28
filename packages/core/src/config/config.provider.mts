import { env } from 'node:process'

import { FactoryInjectionToken, InjectionToken } from '@navios/di'

import { z } from 'zod/v4'

import type { ConfigServiceOptions } from './config.service.mjs'

import {
  ConfigService,
  ConfigServiceOptionsSchema,
  ConfigServiceToken,
} from './config.service.mjs'

export const ConfigProviderOptions = z.object({
  load: z.function({ output: ConfigServiceOptionsSchema }),
})

export function provideConfig<ConfigMap extends ConfigServiceOptions>(
  options: z.input<typeof ConfigProviderOptions>,
): FactoryInjectionToken<
  ConfigService<ConfigMap>,
  typeof ConfigServiceOptionsSchema
> {
  return InjectionToken.factory(ConfigServiceToken, async () => options.load())
}

export const EnvConfigProvider = InjectionToken.bound<
  ConfigService<Record<string, string>>,
  typeof ConfigServiceOptionsSchema
>(ConfigServiceToken, {
  ...env,
})
