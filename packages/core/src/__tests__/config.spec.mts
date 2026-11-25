import { inspect } from 'node:util'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { StandardSchemaV1 } from '@navios/di'

import {
  ConfigService,
  Container,
  EnvConfigProvider,
  inject,
  Injectable,
  InjectionToken,
  LoggerOutput,
  provide,
  provideConfig,
} from '../index.mjs'

describe('provideConfig', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('gives a ConfigService over what load returns', async () => {
    const AppConfig = provideConfig({ load: async () => ({ port: 3000, db: { host: 'local' } }) })

    const config = await container.get(AppConfig)

    expect(config).toBeInstanceOf(ConfigService)
    expect(config.get('port')).toBe(3000)
    expect(config.get('db.host')).toBe('local')
    expect(config.getConfig()).toEqual({ port: 3000, db: { host: 'local' } })
  })

  it('is synchronous when load is', () => {
    const AppConfig = provideConfig({ load: () => ({ port: 3000 }) })

    expect(container.getSync(AppConfig).get('port')).toBe(3000)
  })

  it('returns an ordinary token, which can be replaced', async () => {
    const A = provideConfig({ load: () => ({ port: 3000 }) })
    const B = provideConfig({ load: () => ({ port: 4000 }) })
    const own = new Container({
      providers: [provide(A, { value: new ConfigService({ port: 1 }) })],
    })

    expect(A).toBeInstanceOf(InjectionToken)
    expect((await own.get(A)).get('port')).toBe(1)
    expect((await own.get(B)).get('port')).toBe(4000)
    await own.dispose()
  })

  it('loads once per container, and gives two tokens two instances', async () => {
    const load = vi.fn(() => ({ a: 1 }))
    const A = provideConfig({ load })
    const B = provideConfig({ load })

    const first = await container.get(A)

    expect(await container.get(A)).toBe(first)
    expect(await container.get(B)).not.toBe(first)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('names the token', () => {
    expect(String(provideConfig({ load: () => ({}) }))).toBe('Config')
    expect(String(provideConfig({ name: 'DbConfig', load: () => ({}) }))).toBe('DbConfig')
  })

  it('can be used by the logger output', async () => {
    const AppConfig = provideConfig({ load: () => ({ prefix: 'configured' }) })
    const output = provide(LoggerOutput, {
      factory: async (ctx) => {
        const prefix = (await ctx.inject(AppConfig)).get('prefix')
        return { log() {}, warn() {}, error() {}, prefix }
      },
    })
    const own = new Container({ providers: [output] })

    expect(await own.get(LoggerOutput)).toHaveProperty('prefix', 'configured')
    await own.dispose()
  })

  it('says what is wrong with a configuration, without a value of it', async () => {
    const AppConfig = provideConfig({
      name: 'AppConfig',
      schema: z.object({ port: z.number(), database: z.object({ url: z.string() }) }),
      load: () => ({ port: 'abc', password: 'hunter2-secret', database: {} }),
    })

    const error = await container.get(AppConfig).then(
      () => null,
      (reason: Error) => reason,
    )

    const printed = inspect(error, { depth: 10, showHidden: true }) + JSON.stringify(error)
    expect(printed).toContain('[Navios] Invalid configuration AppConfig: port: ')
    expect(printed).toContain('database.url: ')
    expect(printed).not.toContain('hunter2-secret')
    expect(printed).not.toContain('abc')
  })

  describe('when the messages of the schema may contain a value', () => {
    type Issue = { path?: Array<string | { key: PropertyKey }>; message: string }

    /** What is said about a configuration of which a schema says `issues`. */
    async function said(loaded: unknown, ...issues: Issue[]) {
      const schema: StandardSchemaV1<object, object> = {
        '~standard': { version: 1, vendor: 'test', validate: () => ({ issues }) },
      }
      const AppConfig = provideConfig({ name: 'App', schema, load: () => loaded as object })
      const error = await container.get(AppConfig).then(
        () => null,
        (reason: Error) => reason,
      )
      expect(inspect(error, { depth: 10, showHidden: true })).not.toMatch(/hunter2|s3cr3t|pw@h/i)
      return error!.message.replace(/^.*Invalid configuration App: /, '')
    }

    const withheld = 'is invalid. What the schema says about it may contain the value.'

    it('keeps one that contains it to itself', async () => {
      const config = {
        DB_PASSWORD: 'hunter2',
        PIN: 1234,
        DAY: new Date(0),
        URL: 'postgres//user:pw@h',
        nested: { list: [{ key: 's3cr3t' }] },
      }

      expect(
        await said(config, {
          path: ['DB_PASSWORD'],
          message: 'Invalid format: Expected /^[A-Z]{20}$/ but received "hunter2"',
        }),
      ).toBe(`DB_PASSWORD ${withheld}`)
      expect(
        await said(config, { path: [{ key: 'DB_PASSWORD' }], message: 'was HUNTER2, must not be' }),
      ).toBe(`DB_PASSWORD ${withheld}`)
      expect(
        await said(config, { path: ['URL'], message: 'must be a URL (was "postgres//user:p...")' }),
      ).toBe(`URL ${withheld}`)
      expect(await said(config, { path: ['PIN'], message: 'must be < 100 (was 1234)' })).toBe(
        `PIN ${withheld}`,
      )
      expect(await said(config, { path: ['DAY'], message: 'was 1970-01-01T00:00:00.000Z' })).toBe(
        `DAY ${withheld}`,
      )
      expect(
        await said(config, { path: ['nested', 'list'], message: 'got [{"key":"s3cr3t"}]' }),
      ).toBe(`nested.list ${withheld}`)
      // What a schema moved is not where the path says.
      expect(await said(config, { path: ['renamed'], message: 'but received "hunter2"' })).toBe(
        `renamed ${withheld}`,
      )
      expect(await said(config, { message: 'must be strict (was {"k":"s3cr3t"})' })).toBe(
        `The configuration ${withheld}`,
      )
    })

    it('tells one that does not', async () => {
      const config = {
        PORT: 'abc',
        EMPTY: '',
        OFF: false,
        NOTHING: null,
        NAME: 'hunter2',
        NODE_ENV: 'production',
      }

      for (const [path, message] of [
        ['PORT', 'expected number, received string'],
        ['MISSING', 'expected string, received undefined'],
        ['MISSING', 'is required in production'],
        ['EMPTY', 'must not be empty'],
        ['OFF', 'must not be false'],
        ['NOTHING', 'expected string, received null'],
      ]) {
        expect(await said(config, { path: [path], message })).toBe(`${path}: ${message}`)
      }
      expect(await said(config, { message: 'one of A and B has to be set' })).toBe(
        'one of A and B has to be set',
      )
      expect(await said(5, { message: 'expected object, received number' })).toBe(
        'expected object, received number',
      )
      expect(await said(undefined, { message: 'expected object, received undefined' })).toBe(
        'expected object, received undefined',
      )
    })

    it('survives a configuration that cannot be looked through', async () => {
      const config: Record<string, unknown> = { SECRET: 'hunter2' }
      config.self = config
      Object.defineProperty(config, 'broken', {
        enumerable: true,
        get() {
          throw new Error('hunter2')
        },
      })

      expect(await said(config, { path: ['broken'], message: 'is broken' })).toBe(
        `broken ${withheld}`,
      )
      expect(await said(config, { path: ['self', 'SECRET'], message: 'was hunter2' })).toBe(
        `self.SECRET ${withheld}`,
      )
    })
  })

  it('refuses a schema that validates asynchronously', async () => {
    const AppConfig = provideConfig({
      schema: z.object({}).refine(async () => true),
      load: () => ({}),
    })

    await expect(container.get(AppConfig)).rejects.toThrow('must validate synchronously')
  })

  it.each([undefined, null, 1, 'text', [1]])('refuses %j as a configuration', async (loaded) => {
    const AppConfig = provideConfig({ load: () => loaded as object })

    await expect(container.get(AppConfig)).rejects.toThrow('must be an object')
  })
})

describe('ConfigService', () => {
  it('can be created without a container', () => {
    const config = new ConfigService({ port: 1, db: { host: 'x' }, empty: '', zero: 0 })

    expect(config.get('db.host')).toBe('x')
    expect(config.get('empty')).toBe('')
    expect(config.get('zero')).toBe(0)
  })

  it('falls back to the default, or throws, when a value is missing', () => {
    const config = new ConfigService<{ name?: string; db?: { host: string } }>({})

    expect(config.get('name')).toBeNull()
    expect(config.get('db.host')).toBeNull()
    expect(config.getOrDefault('db.host', 'local')).toBe('local')
    expect(() => config.getOrThrow('db.host')).toThrow(
      'Configuration value for key "db.host" is not defined',
    )
    expect(() => config.getOrThrow('name', 'a name is needed')).toThrow('a name is needed')
  })
})

describe('EnvConfigProvider', () => {
  afterEach(() => {
    delete process.env.NAVIOS_TEST_ENV
  })

  it('is a snapshot of the environment, whose values are in no instance name', async () => {
    process.env.NAVIOS_TEST_ENV = 'from-env'
    const container = new Container()

    @Injectable()
    class Service {
      readonly env = inject(EnvConfigProvider)
    }
    const { env } = await container.get(Service)

    expect(EnvConfigProvider).toBeInstanceOf(InjectionToken)
    expect(env.get('NAVIOS_TEST_ENV')).toBe('from-env')
    process.env.NAVIOS_TEST_ENV = 'changed'
    expect(env.get('NAVIOS_TEST_ENV')).toBe('from-env')
    await container.dispose()
  })
})
