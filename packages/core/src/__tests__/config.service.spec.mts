import { env } from 'node:process'

import { describe, expect, it } from 'vitest'

import {
  ConfigService,
  ConfigServiceToken,
  EnvConfigProvider,
  getGlobalServiceLocator,
  inject,
  Injectable,
  Logger,
  syncInject,
} from '../index.mjs'

describe('ConfigService', () => {
  it('should be able to get a config value', async () => {
    const service = await inject(ConfigServiceToken, env)
    expect(service).toBeDefined()
    expect(service.get('NODE_ENV')).toBe(env.NODE_ENV)
  })

  it('should be possible to use bound config service', async () => {
    const service = await inject(EnvConfigProvider)
    expect(service).toBeDefined()
    expect(service.get('NODE_ENV')).toBe(env.NODE_ENV)
  })

  it('should be possible to use inside service as a syncInject', async () => {
    @Injectable()
    class TestService {
      public readonly configService = syncInject(EnvConfigProvider)
      public readonly logger = syncInject(Logger)
    }

    const service = await inject(TestService)

    expect(service.configService).toBeDefined()
    expect(service.configService.get('NODE_ENV')).toBe(env.NODE_ENV)
  })
})
