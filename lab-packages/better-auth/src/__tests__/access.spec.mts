import { builder } from '@navios/builder'
import { Controller, Endpoint, handler, Module, NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NaviosApplication, RequestContext, TestResponse } from '@navios/server'
import type { BetterAuthOptions } from 'better-auth'

import {
  Authenticated,
  BetterAuthGuard,
  betterAuthPlugin,
  CurrentSession,
  CurrentUser,
  Guest,
  OptionalAuth,
  provideBetterAuth,
  Public,
  Roles,
} from '../index.mjs'

import { migrate, testOptions } from './helpers.mjs'

const api = builder()
const text = (url: string) => api.declareEndpoint({ method: 'GET', url, response: 'text' })

const open = text('/open')
const me = text('/me')
const session = text('/session')
const publicPage = text('/public')
const register = text('/register')
const greeting = text('/greeting')
const admin = text('/admin')
const editor = text('/editor')
const field = text('/field')

function cookieOf(response: TestResponse): string {
  return response.cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

/** Options with a `role` a test can set at sign-up, as Better Auth's admin plugin stores it. */
function withRoles(extra: Partial<BetterAuthOptions> = {}) {
  return {
    ...testOptions(),
    user: {
      additionalFields: { role: { type: 'string', required: false, input: true } },
    },
    ...extra,
  } satisfies BetterAuthOptions
}

describe('access decorators', () => {
  let app: NaviosApplication<any>

  afterEach(async () => {
    await app?.close()
  })

  async function start(appModule: new () => object, options: Partial<BetterAuthOptions> = {}) {
    const Auth = provideBetterAuth(withRoles(options))
    app = await NaviosFactory.create(appModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [betterAuthPlugin({ auth: Auth })],
    })
    await app.init()
    const auth = await app.get(Auth)
    await migrate(auth)
    return auth
  }

  async function signUp(email: string, role = 'user') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      body: { email, password: 'correct horse battery', name: email, role },
    })
    expect(response.status).toBe(200)
    return cookieOf(response)
  }

  const get = (url: string, cookie?: string) =>
    app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })

  describe('on handlers', () => {
    @Controller()
    class AccessController {
      @Endpoint(open)
      open() {
        return 'open'
      }

      @Authenticated()
      @Endpoint(me)
      me(_params: unknown, ctx: RequestContext) {
        return ctx.get(CurrentUser).email
      }

      @Authenticated()
      @Endpoint(session)
      session(_params: unknown, ctx: RequestContext) {
        const record = ctx.get(CurrentSession)
        return record.userId === ctx.get(CurrentUser).id ? 'same user' : 'other user'
      }

      @Guest()
      @Endpoint(register)
      register() {
        return 'guest'
      }

      @OptionalAuth()
      @Endpoint(greeting)
      greeting(_params: unknown, ctx: RequestContext) {
        return ctx.find(CurrentUser)?.email ?? 'stranger'
      }

      @Roles('admin')
      @Endpoint(admin)
      admin(_params: unknown, ctx: RequestContext) {
        return ctx.get(CurrentUser).email
      }

      @Roles('editor', 'admin')
      @Endpoint(editor)
      editor() {
        return 'editor'
      }
    }

    @Module({ controllers: [AccessController] })
    class AppModule {}

    it('should not check a route without a decorator, nor look the session up', async () => {
      const auth = await start(AppModule)
      const getSession = vi.spyOn(auth.api, 'getSession')

      const response = await get('/open')

      expect(response.text).toBe('open')
      expect(getSession).not.toHaveBeenCalled()
    })

    it('should answer @Authenticated() without a session with 401', async () => {
      await start(AppModule)

      const response = await get('/me')

      expect(response.status).toBe(401)
      expect(response.body).toMatchObject({ detail: 'Not signed in' })
    })

    it('should give an @Authenticated() handler the user and the session, synchronously', async () => {
      await start(AppModule)
      const cookie = await signUp('ada@example.com')

      expect((await get('/me', cookie)).text).toBe('ada@example.com')
      expect((await get('/session', cookie)).text).toBe('same user')
    })

    it('should let a guest through @Guest() and refuse a signed-in user with 403', async () => {
      await start(AppModule)
      const cookie = await signUp('ada@example.com')

      expect((await get('/register')).text).toBe('guest')
      const signedIn = await get('/register', cookie)
      expect(signedIn.status).toBe(403)
      expect(signedIn.body).toMatchObject({ detail: 'Already signed in' })
    })

    it('should give an @OptionalAuth() handler the user when there is one', async () => {
      await start(AppModule)
      const cookie = await signUp('ada@example.com')

      expect((await get('/greeting')).text).toBe('stranger')
      expect((await get('/greeting', cookie)).text).toBe('ada@example.com')
    })

    it('should check @Roles() against the roles of the user', async () => {
      await start(AppModule)
      const user = await signUp('user@example.com', 'user')
      const boss = await signUp('boss@example.com', 'admin')
      const both = await signUp('both@example.com', 'user, editor')

      expect((await get('/admin')).status).toBe(401)
      expect((await get('/admin', user)).status).toBe(403)
      expect((await get('/admin', boss)).text).toBe('boss@example.com')
      expect((await get('/editor', both)).text).toBe('editor')
      expect((await get('/editor', boss)).text).toBe('editor')
    })

    it('should give every request its own user', async () => {
      await start(AppModule)
      const ada = await signUp('ada@example.com')
      const grace = await signUp('grace@example.com')

      const answers = [await get('/me', ada), await get('/me', grace), await get('/me', ada)]

      expect(answers.map((response) => response.text)).toEqual([
        'ada@example.com',
        'grace@example.com',
        'ada@example.com',
      ])
    })

    it('should send the cookie of a session Better Auth refreshed', async () => {
      await start(AppModule, { session: { updateAge: 0 } })
      const cookie = await signUp('ada@example.com')

      const response = await get('/me', cookie)

      expect(response.cookies.some((value) => value.startsWith('better-auth.session_token='))).toBe(
        true,
      )
    })
  })

  describe('on modules and controllers', () => {
    @Authenticated()
    @Controller()
    class ProtectedController {
      @Endpoint(me)
      me(_params: unknown, ctx: RequestContext) {
        return ctx.get(CurrentUser).email
      }

      @Public()
      @Endpoint(publicPage)
      publicPage() {
        return 'public'
      }

      @Guest()
      @Endpoint(register)
      register() {
        return 'guest'
      }

      @Roles('admin')
      @Endpoint(admin)
      admin() {
        return 'admin'
      }
    }

    @Controller()
    class OpenController {
      @Endpoint(open)
      open() {
        return 'open'
      }
    }

    @Authenticated()
    @Module({ controllers: [ProtectedController] })
    class ProtectedModule {}

    @Module({ controllers: [OpenController], imports: [ProtectedModule] })
    class AppModule {}

    it('should let the most specific declaration win', async () => {
      const auth = await start(AppModule)
      const cookie = await signUp('ada@example.com')
      const getSession = vi.spyOn(auth.api, 'getSession')

      expect((await get('/me')).status).toBe(401)
      expect((await get('/me', cookie)).text).toBe('ada@example.com')
      expect((await get('/public')).text).toBe('public')
      expect((await get('/register')).text).toBe('guest')
      expect((await get('/register', cookie)).status).toBe(403)
      expect((await get('/admin', cookie)).status).toBe(403)
      expect((await get('/open')).text).toBe('open')
      // Two for /me, two for /register, one for /admin: none for /public or /open.
      expect(getSession).toHaveBeenCalledTimes(5)
    })

    it('should look the session up once when the guard is attached at three levels', async () => {
      const auth = await start(AppModule)
      const cookie = await signUp('ada@example.com')
      const getSession = vi.spyOn(auth.api, 'getSession')

      await get('/me', cookie)

      expect(getSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('other forms', () => {
    it('should work on a handler() field', async () => {
      @Controller()
      class FieldController {
        @Authenticated()
        field = handler(field, (_params, ctx) => ctx.get(CurrentUser).email)
      }

      @Module({ controllers: [FieldController] })
      class AppModule {}

      await start(AppModule)
      const cookie = await signUp('ada@example.com')

      expect((await get('/field')).status).toBe(401)
      expect((await get('/field', cookie)).text).toBe('ada@example.com')
    })

    it('should read the decorators when BetterAuthGuard is given to a module', async () => {
      @Controller()
      class GuardedController {
        @Endpoint(open)
        open() {
          return 'open'
        }

        @Authenticated()
        @Endpoint(me)
        me() {
          return 'me'
        }
      }

      @Module({ controllers: [GuardedController], guards: [BetterAuthGuard] })
      class AppModule {}

      await start(AppModule)

      expect((await get('/open')).text).toBe('open')
      expect((await get('/me')).status).toBe(401)
    })

    it('should refuse @Roles() without a role when the class is defined', () => {
      expect(() => (Roles as unknown as () => unknown)()).toThrow(/at least one role/)
    })
  })
})
