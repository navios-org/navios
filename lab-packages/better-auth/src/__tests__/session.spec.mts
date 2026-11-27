import { builder } from '@navios/builder'
import { Controller, Endpoint, Injectable, Module, NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Interceptor,
  NaviosApplication,
  RequestContext,
  RouteResult,
  TestResponse,
} from '@navios/server'
import type { BetterAuthOptions } from 'better-auth'

import {
  AllowAnonymous,
  AuthSession,
  BetterAuthGuard,
  betterAuthPlugin,
  provideBetterAuth,
  requireSession,
} from '../index.mjs'

import { migrate, testOptions } from './helpers.mjs'
import { testPlugin } from './test-plugin.mjs'

const ORIGIN = 'http://localhost'

function cookieHeader(response: TestResponse): string {
  return response.cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

describe('sessions', () => {
  let app: NaviosApplication<any>

  afterEach(async () => {
    await app?.close()
  })

  async function createApp(
    authOptions: Partial<BetterAuthOptions> = {},
    interceptors: Array<new () => Interceptor> = [],
  ) {
    const api = builder()
    const getMe = api.declareEndpoint({ method: 'GET', url: '/me', response: 'text' })
    const getGreeting = api.declareEndpoint({ method: 'GET', url: '/greeting', response: 'text' })
    const getStrict = api.declareEndpoint({ method: 'GET', url: '/strict', response: 'text' })

    @Controller()
    class AccountController {
      @Endpoint(getMe)
      async me(_params: unknown, ctx: RequestContext) {
        const { user } = await requireSession(ctx)
        return user.email
      }

      @AllowAnonymous()
      @Endpoint(getGreeting)
      async greeting(_params: unknown, ctx: RequestContext) {
        const session = await ctx.get(AuthSession)
        return session === null ? 'anonymous' : session.user.email
      }

      @AllowAnonymous()
      @Endpoint(getStrict)
      async strict(_params: unknown, ctx: RequestContext) {
        return (await requireSession(ctx)).user.email
      }
    }

    @Module({ controllers: [AccountController], guards: [BetterAuthGuard] })
    class AppModule {}

    const Auth = provideBetterAuth({ ...testOptions(), ...authOptions })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [betterAuthPlugin({ auth: Auth })],
    })
    for (const interceptor of interceptors) {
      app.intercept(interceptor)
    }
    await app.init()
    const auth = await app.get(Auth)
    await migrate(auth)
    return { app, auth }
  }

  async function signUp(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: ORIGIN },
      body: { email, password: 'correct horse battery', name: email },
    })
    return cookieHeader(response)
  }

  it('should answer a guarded route without a session with 401', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/me' })

    expect(response.status).toBe(401)
    expect(response.headers['content-type']).toBe('application/problem+json')
  })

  it('should let a request with a session through to the handler', async () => {
    await createApp()
    const cookie = await signUp('ada@example.com')

    const response = await app.inject({ method: 'GET', url: '/me', headers: { cookie } })

    expect(response.status).toBe(200)
    expect(response.text).toBe('ada@example.com')
  })

  it('should let an anonymous request through AllowAnonymous, without a session', async () => {
    await createApp()
    const cookie = await signUp('ada@example.com')

    const anonymous = await app.inject({ method: 'GET', url: '/greeting' })
    const signedIn = await app.inject({ method: 'GET', url: '/greeting', headers: { cookie } })

    expect(anonymous.text).toBe('anonymous')
    expect(signedIn.text).toBe('ada@example.com')
  })

  it('should answer requireSession without a session with 401, on any route', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/strict' })

    expect(response.status).toBe(401)
  })

  it('should give every request its own session', async () => {
    await createApp()
    const ada = await signUp('ada@example.com')
    const grace = await signUp('grace@example.com')

    const first = await app.inject({ method: 'GET', url: '/me', headers: { cookie: ada } })
    const second = await app.inject({ method: 'GET', url: '/me', headers: { cookie: grace } })
    const third = await app.inject({ method: 'GET', url: '/me', headers: { cookie: ada } })

    expect([first.text, second.text, third.text]).toEqual([
      'ada@example.com',
      'grace@example.com',
      'ada@example.com',
    ])
  })

  it('should look the session up once per request, for the guard and the handler', async () => {
    const { auth } = await createApp()
    const cookie = await signUp('ada@example.com')
    const getSession = vi.spyOn(auth.api, 'getSession')

    await app.inject({ method: 'GET', url: '/me', headers: { cookie } })

    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it("should keep a refreshed session cookie next to the cookies of Better Auth's response", async () => {
    @Injectable()
    class ReadsSession implements Interceptor {
      async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
        await ctx.get(AuthSession)
        return next()
      }
    }
    await createApp({ session: { updateAge: 0 }, plugins: [testPlugin()] }, [ReadsSession])
    const cookie = await signUp('ada@example.com')

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/test/redirect',
      headers: { cookie },
    })

    expect(response.status).toBe(302)
    const names = response.cookies.map((value) => value.split('=')[0]).sort()
    expect(names).toEqual(['better-auth.session_token', 'first', 'second'])
  })

  it('should send the cookie of a refreshed session with the response', async () => {
    await createApp({ session: { updateAge: 0 } })
    const cookie = await signUp('ada@example.com')

    const response = await app.inject({ method: 'GET', url: '/me', headers: { cookie } })

    expect(response.status).toBe(200)
    expect(response.cookies.some((value) => value.startsWith('better-auth.session_token='))).toBe(
      true,
    )
  })
})
