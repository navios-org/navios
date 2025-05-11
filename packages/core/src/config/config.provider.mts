import { z } from 'zod'

import type { ConfigService } from './config-service.interface.mjs'

import { Logger } from '../logger/index.mjs'
import {
  Injectable,
  InjectableType,
  InjectionToken,
  syncInject,
} from '../service-locator/index.mjs'
import { ConfigServiceInstance } from './config.service.mjs'

export const ConfigProviderOptions = z.object({
  load: z.function(),
})

export const ConfigProvider = InjectionToken.create<
  ConfigService,
  typeof ConfigProviderOptions
>(ConfigServiceInstance, ConfigProviderOptions)

@Injectable({
  token: ConfigProvider,
  type: InjectableType.Factory,
})
export class ConfigProviderFactory {
  logger = syncInject(Logger, {
    context: 'ConfigService',
  })

  async create(ctx: any, args: z.infer<typeof ConfigProviderOptions>) {
    const { load } = args
    const logger = this.logger
    try {
      const config = await load()

      return new ConfigServiceInstance(config, logger)
    } catch (error) {
      logger.error('Error loading config', error)
      throw error
    }
  }
}

export function provideConfig<ConfigMap extends Record<string, unknown>>(
  options: z.input<typeof ConfigProviderOptions>,
) {
  return InjectionToken.bound(ConfigProvider, options) as InjectionToken<
    ConfigServiceInstance<ConfigMap>,
    undefined
  >
}
