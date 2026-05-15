import { env } from 'node:process'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ConfigServiceToken,
  Container,
  EnvConfigProvider,
  Inject,
  Injectable,
  Logger,
} from '../index.mjs'

import type { ConfigService, LoggerInstance } from '../index.mjs'

describe('ConfigService', () => {
  let container: Container
  beforeEach(() => {
    container = new Container()
  })
  it('should be able to get a config value', async () => {
    const service = await container.get(ConfigServiceToken, { ...env })
    expect(service).toBeDefined()
    expect(service.get('NODE_ENV')).toBe(env.NODE_ENV)
  })

  it('should be possible to use bound config service', async () => {
    const service = await container.get(EnvConfigProvider)
    expect(service).toBeDefined()
    expect(service.get('NODE_ENV')).toBe(env.NODE_ENV)
  })

  it('should be possible to use inside service as a inject', async () => {
    @Injectable()
    class TestService {
      @Inject(EnvConfigProvider)
      public accessor configService!: ConfigService<Record<string, string>>

      @Inject(Logger) public accessor logger!: LoggerInstance
    }

    const service = await container.get(TestService)

    expect(service.configService).toBeDefined()
    expect(service.configService.get('NODE_ENV')).toBe(env.NODE_ENV)
  })
})
