import { builder } from '@navios/builder'
import { Controller, definePlugin, Endpoint, InjectionToken, Module, provide } from '@navios/server'
import { describe, expect, it } from 'vitest'

import { authForCli, provideBetterAuth } from '../index.mjs'

import { testOptions } from './helpers.mjs'

describe('authForCli', () => {
  function createAuth() {
    const AppName = InjectionToken.create<string>('AppName')
    const Auth = provideBetterAuth(async (ctx) => ({
      ...testOptions(),
      appName: await ctx.inject(AppName),
    }))
    return { AppName, Auth }
  }

  it('should return a function that resolves the instance from the module, without a transport', async () => {
    const { AppName, Auth } = createAuth()

    @Module({ providers: [provide(AppName, { value: 'from the module' })] })
    class AppModule {}

    const load = authForCli(Auth, { module: AppModule })

    expect(typeof load).toBe('function')
    const auth = await load()
    expect(auth.options.appName).toBe('from the module')
    expect(typeof (await auth.$context).runMigrations).toBe('function')
  })

  it('should let the providers option win over those of modules', async () => {
    const { AppName, Auth } = createAuth()

    @Module({ providers: [provide(AppName, { value: 'from the module' })] })
    class AppModule {}

    const auth = await authForCli(Auth, {
      module: AppModule,
      providers: [provide(AppName, { value: 'from the option' })],
    })()

    expect(auth.options.appName).toBe('from the option')
  })

  it('should set up the plugins it is given, for what they provide', async () => {
    const { AppName, Auth } = createAuth()
    const naming = definePlugin({
      name: 'naming',
      setup(api) {
        api.provide(AppName, { value: 'from a plugin' })
      },
    })

    @Module()
    class AppModule {}

    const auth = await authForCli(Auth, { module: AppModule, plugins: [naming()] })()

    expect(auth.options.appName).toBe('from a plugin')
  })

  it('should load a module that has controllers', async () => {
    const { AppName, Auth } = createAuth()
    const getPing = builder().declareEndpoint({ method: 'GET', url: '/ping', response: 'text' })

    @Controller()
    class PingController {
      @Endpoint(getPing)
      ping() {
        return 'pong'
      }
    }

    @Module({
      controllers: [PingController],
      providers: [provide(AppName, { value: 'with controllers' })],
    })
    class AppModule {}

    const auth = await authForCli(Auth, { module: AppModule })()

    expect(auth.options.appName).toBe('with controllers')
  })
})
