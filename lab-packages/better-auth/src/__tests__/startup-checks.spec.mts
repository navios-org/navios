import { createApplication, Module, NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it } from 'vitest'

import type { Application, NaviosApplication } from '@navios/server'
import type { BetterAuthOptions } from 'better-auth'

import { betterAuthPlugin, provideBetterAuth } from '../index.mjs'

import type { BetterAuthPluginOptions } from '../index.mjs'

import { migrate, testOptions } from './helpers.mjs'

describe('betterAuthPlugin start-up checks', () => {
  let app: NaviosApplication<any> | Application | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function createApp(
    authOptions: Partial<BetterAuthOptions>,
    plugin: Omit<BetterAuthPluginOptions, 'auth'> = {},
    globalPrefix?: string,
  ) {
    @Module()
    class AppModule {}

    const Auth = provideBetterAuth({ ...testOptions(), ...authOptions })
    const created = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      globalPrefix,
      plugins: [betterAuthPlugin({ auth: Auth, ...plugin })],
    })
    app = created
    return { app: created, Auth }
  }

  it('should refuse to start when the prefixes move the routes away from the base path', async () => {
    const { app } = await createApp({}, {}, '/v1')

    await expect(app.init()).rejects.toThrow(
      /served at "\/v1\/api\/auth".*base path is "\/api\/auth".*basePath: '\/v1\/api\/auth'/s,
    )
  })

  it('should start when basePath includes the prefixes', async () => {
    const { app, Auth } = await createApp({ basePath: '/v1/api/auth' }, {}, '/v1')
    await app.init()
    await migrate(await app.get(Auth))

    const response = await app.inject({ method: 'GET', url: '/v1/api/auth/ok' })

    expect(response.body).toEqual({ ok: true })
  })

  it('should read the base path from the path of baseURL', async () => {
    const { app, Auth } = await createApp({ baseURL: 'http://localhost/v1/api/auth' }, {}, '/v1')
    await app.init()
    await migrate(await app.get(Auth))

    const response = await app.inject({ method: 'GET', url: '/v1/api/auth/ok' })

    expect(response.body).toEqual({ ok: true })
  })

  it('should name baseURL in the advice when the base path comes from it', async () => {
    const { app } = await createApp({ baseURL: 'http://localhost/api/auth' }, {}, '/v1')

    await expect(app.init()).rejects.toThrow(/change the path of `baseURL` to "\/v1\/api\/auth"/)
  })

  it('should compare paths whatever slashes surround them', async () => {
    const { app } = await createApp({ basePath: '/auth/' }, { path: 'auth' })

    await expect(app.init()).resolves.toBe(app)
  })

  it('should refuse an application without the HTTP transport', async () => {
    @Module()
    class AppModule {}

    const Auth = provideBetterAuth(testOptions())
    app = createApplication(AppModule, {
      logger: false,
      plugins: [betterAuthPlugin({ auth: Auth })],
    })

    await expect(app.init()).rejects.toThrow(/needs the HTTP transport/)
  })
})
