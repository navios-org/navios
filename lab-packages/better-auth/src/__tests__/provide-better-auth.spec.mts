import { Container, InjectionToken, provide } from '@navios/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { provideBetterAuth } from '../index.mjs'

import { testOptions } from './helpers.mjs'

describe('provideBetterAuth', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should name the token BetterAuth, or as given', () => {
    expect(provideBetterAuth(testOptions()).toString()).toBe('BetterAuth')
    expect(provideBetterAuth(testOptions(), { name: 'AdminAuth' }).toString()).toBe('AdminAuth')
  })

  it('should create a Better Auth instance from static options', async () => {
    const options = testOptions()
    const Auth = provideBetterAuth(options)

    const auth = await container.get(Auth)

    expect(typeof auth.handler).toBe('function')
    expect(typeof auth.api.getSession).toBe('function')
    expect(auth.options.secret).toBe(options.secret)
  })

  it('should create the instance once per container', async () => {
    const Auth = provideBetterAuth(testOptions())

    const first = await container.get(Auth)

    expect(await container.get(Auth)).toBe(first)
    const other = new Container()
    try {
      expect(await other.get(Auth)).not.toBe(first)
    } finally {
      await other.dispose()
    }
  })

  it('should give every call a token and an instance of its own', async () => {
    const First = provideBetterAuth(testOptions())
    const Second = provideBetterAuth(testOptions())

    expect(First).not.toBe(Second)
    expect(await container.get(First)).not.toBe(await container.get(Second))
  })

  it('should pass the factory context to a configuration function', async () => {
    const AppName = InjectionToken.create<string>('AppName')
    const Auth = provideBetterAuth(async (ctx) => ({
      ...testOptions(),
      appName: await ctx.inject(AppName),
    }))
    const local = new Container({ providers: [provide(AppName, { value: 'Notes' })] })
    try {
      const auth = await local.get(Auth)

      expect(auth.options.appName).toBe('Notes')
    } finally {
      await local.dispose()
    }
  })

  it('should accept a synchronous configuration function', async () => {
    const Auth = provideBetterAuth(() => ({ ...testOptions(), appName: 'Sync' }))

    expect((await container.get(Auth)).options.appName).toBe('Sync')
  })

  it('should reject with what the configuration function throws', async () => {
    const Auth = provideBetterAuth(async () => {
      throw new Error('no database')
    })

    await expect(container.get(Auth)).rejects.toThrow('no database')
  })
})
