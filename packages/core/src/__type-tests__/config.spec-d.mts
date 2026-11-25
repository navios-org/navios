import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'

import { ConfigService, envString, inject, provide, provideConfig } from '../index.mjs'

import type { Container, InjectionToken, Path, PathValue } from '../index.mjs'

interface AppConfig {
  database: { host: string; port: number }
  cache?: { url: string; tls?: { ca: string } }
  token: string | undefined
  when: Date
  hosts: string[]
  load: () => void
}

describe('configuration paths', () => {
  it('lists keys and nested keys, also of optional sections', () => {
    expectTypeOf<Path<AppConfig>>().toEqualTypeOf<
      | 'database'
      | 'database.host'
      | 'database.port'
      | 'cache'
      | 'cache.url'
      | 'cache.tls'
      | 'cache.tls.ca'
      | 'token'
      | 'when'
      | 'hosts'
      | 'load'
    >()
  })

  it('gives the type at a path', () => {
    expectTypeOf<PathValue<AppConfig, 'database.port'>>().toEqualTypeOf<number>()
    expectTypeOf<PathValue<AppConfig, 'cache.url'>>().toEqualTypeOf<string | undefined>()
    expectTypeOf<PathValue<AppConfig, 'cache.tls.ca'>>().toEqualTypeOf<string | undefined>()
    expectTypeOf<PathValue<AppConfig, 'when'>>().toEqualTypeOf<Date>()
  })

  it('does not go into a recursive type for ever', () => {
    interface Tree {
      name: string
      child?: Tree
    }
    expectTypeOf<PathValue<Tree, 'child.child.name'>>().toEqualTypeOf<string | undefined>()
  })
})

describe('ConfigService', () => {
  const config = new ConfigService({} as AppConfig)

  it('never gives undefined', () => {
    expectTypeOf(config.get('database.port')).toEqualTypeOf<number | null>()
    expectTypeOf(config.get('token')).toEqualTypeOf<string | null>()
    expectTypeOf(() => config.getOrThrow('token')).returns.toEqualTypeOf<string>()
    expectTypeOf(() => config.getOrThrow('cache.url')).returns.toEqualTypeOf<string>()
    expectTypeOf(config.getOrDefault('cache.url', 'redis://local')).toEqualTypeOf<string>()
  })

  it('rejects a path that does not exist', () => {
    // @ts-expect-error a Date has no configuration in it
    config.get('when.getTime')
    // @ts-expect-error no such key
    config.get('database.name')
    // @ts-expect-error a default of another type
    config.getOrDefault('database.port', 'x')
  })
})

describe('provideConfig', () => {
  it('accepts an interface and what is typed by one', () => {
    const load = (): AppConfig => ({}) as AppConfig

    expectTypeOf(provideConfig<AppConfig>({ load })).toEqualTypeOf<
      InjectionToken<ConfigService<AppConfig>, undefined>
    >()
    expectTypeOf(provideConfig({ load: async () => load() })).toEqualTypeOf<
      InjectionToken<ConfigService<AppConfig>, undefined>
    >()
    expectTypeOf(() => inject(provideConfig({ load }))).returns.toEqualTypeOf<
      ConfigService<AppConfig>
    >()
  })

  it('types the service by the output of the schema', () => {
    interface Out {
      port: number
    }
    const schema = z.object({ port: z.coerce.number() }) as z.ZodType<Out>

    expectTypeOf(provideConfig({ schema, load: () => ({}) })).toEqualTypeOf<
      InjectionToken<ConfigService<Out>, undefined>
    >()
  })

  it('can be provided', () => {
    const Token = provideConfig({ load: () => ({ port: 1 }) })

    provide(Token, { value: new ConfigService({ port: 2 }) })
    expectTypeOf((container: Container) => container.getSync(Token)).returns.toEqualTypeOf<
      ConfigService<{ port: number }>
    >()
    // @ts-expect-error another configuration
    provide(Token, { value: new ConfigService({ host: 'x' }) })
  })
})

describe('envString', () => {
  it('is undefined only when the default is', () => {
    const maybe = 'x' as string | undefined

    expectTypeOf(envString('X')).toEqualTypeOf<string | undefined>()
    expectTypeOf(envString('X', 'd')).toEqualTypeOf<string>()
    expectTypeOf(envString('X', maybe)).toEqualTypeOf<string | undefined>()
  })
})
