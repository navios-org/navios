import { z } from 'zod'

import type { ConfigService } from './config-service.interface.mjs'

import { Logger } from '../logger/index.mjs'
import {
  getInjectableToken,
  inject,
  Injectable,
  InjectableType,
  InjectionToken,
} from '../service-locator/index.mjs'
import { ConfigServiceInstance } from './config.service.mjs'

export const ConfigProviderInjectionToken = 'ConfigProvider'

export const ConfigProviderOptions = z.object({
  load: z.function(),
})
export const ConfigProvider = InjectionToken.create<
  ConfigService,
  typeof ConfigProviderOptions
>(ConfigProviderInjectionToken, ConfigProviderOptions)

@Injectable({
  token: ConfigProvider,
  type: InjectableType.Factory,
})
export class ConfigProviderFactory {
  logger = inject(Logger, {
    context: 'ConfigService',
  })

  async create(ctx: any, args: z.infer<typeof ConfigProviderOptions>) {
    const { load } = args
    const logger = await this.logger
    try {
      const config = await load()

      return new ConfigServiceInstance(config, logger)
    } catch (error) {
      logger.error('Error loading config', error)
      throw error
    }
  }
}

export function makeConfigToken<Config extends Record<string, unknown>>(
  options: z.input<typeof ConfigProviderOptions>,
): InjectionToken<ConfigService<Config>> {
  @Injectable({
    type: InjectableType.Factory,
  })
  class ConfigServiceImpl {
    configService = inject(ConfigProvider, options)

    create() {
      return this.configService
    }
  }
  return getInjectableToken(ConfigServiceImpl)
}
