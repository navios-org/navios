import { builder } from '@navios/builder'
import { AttributeFactory, Controller, Endpoint, Module, NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { afterEach, describe, expect, it } from 'vitest'

import type { NaviosApplication, TestResponse } from '@navios/server'

import { betterAuthPlugin, provideBetterAuth } from '../index.mjs'
import { AccessAttribute } from '../internal/access-attributes.mjs'

import { migrate, testOptions } from './helpers.mjs'
import { receivedBodies, testPlugin } from './test-plugin.mjs'

const ORIGIN = 'http://localhost'
const OPENAPI_EXCLUDE = AttributeFactory.createAttribute(Symbol.for('navios:openapi:exclude'))

/** The `cookie` request header that sends back what a response set. */
function cookieHeader(response: TestResponse): string {
  return response.cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

describe('betterAuthPlugin', () => {
  let app: NaviosApplication<any>

  afterEach(async () => {
    await app?.close()
  })

  async function createApp() {
    const api = builder()
    const getMe = api.declareEndpoint({ method: 'GET', url: '/api/auth/me', response: 'text' })

    @Controller()
    class MeController {
      @Endpoint(getMe)
      me() {
        return 'application'
      }
    }

    @Module({ controllers: [MeController] })
    class AppModule {}

    const Auth = provideBetterAuth({ ...testOptions(), plugins: [testPlugin()] })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      plugins: [betterAuthPlugin({ auth: Auth })],
    })
    await app.init()
    await migrate(await app.get(Auth))
    return app
  }

  async function signUp(email = 'ada@example.com') {
    return app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: ORIGIN },
      body: { email, password: 'correct horse battery', name: 'Ada' },
    })
  }

  it('should forward a sign-up and return its session cookie', async () => {
    await createApp()

    const response = await signUp()

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect((response.body as { user: { email: string } }).user.email).toBe('ada@example.com')
    expect(response.cookies.some((cookie) => cookie.startsWith('better-auth.session_token='))).toBe(
      true,
    )
  })

  it('should read the session back from the cookie and clear it on sign-out', async () => {
    await createApp()
    const cookie = cookieHeader(await signUp())

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    })
    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: ORIGIN },
    })
    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader(signOut) },
    })

    expect((session.body as { user: { email: string } }).user.email).toBe('ada@example.com')
    expect(signOut.status).toBe(200)
    expect(signOut.cookies.some((value) => value.startsWith('better-auth.session_token=;'))).toBe(
      true,
    )
    expect(after.body).toBeNull()
  })

  it("should answer an unknown auth path with Better Auth's own 404", async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/api/auth/nope' })

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).not.toBe('application/problem+json')
  })

  it('should keep the status, the location and every cookie of a redirect', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/api/auth/test/redirect?to=/done' })

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/done')
    expect(response.cookies.map((cookie) => cookie.split(';')[0])).toEqual(['first=1', 'second=2'])
  })

  it('should forward the query string', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/api/auth/test/echo?x=1&y=a%20b' })

    expect(response.body).toEqual({ query: { x: '1', y: 'a b' } })
  })

  it('should forward a form body as it was sent', async () => {
    await createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/test/echo',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
      body: 'a=1&b=two+words&c=%C3%A9',
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      contentType: 'application/x-www-form-urlencoded',
      body: { a: '1', b: 'two words', c: 'é' },
    })
    expect(receivedBodies.at(-1)).toBe('a=1&b=two+words&c=%C3%A9')
  })

  it('should reach an endpoint of any method and depth', async () => {
    await createApp()

    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/test/a/b/c/d/e/f/g',
      headers: { origin: ORIGIN },
    })

    expect(response.body).toEqual({ deep: true })
  })

  it('should answer HEAD as Better Auth answers GET', async () => {
    await createApp()

    const head = await app.inject({ method: 'HEAD', url: '/api/auth/ok' })

    expect(head.status).toBe(200)
    expect(head.text).toBe('')
  })

  it('should leave a fixed application route under the auth path to the application', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/api/auth/me' })

    expect(response.text).toBe('application')
  })

  it('should not forward a path outside the auth path', async () => {
    await createApp()

    const response = await app.inject({ method: 'GET', url: '/other/sign-in' })

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toBe('application/problem+json')
  })

  it('should mark its routes public and hidden from OpenAPI', async () => {
    await createApp()

    const routes = app.routes().filter((route) => route.path === '/api/auth/$path*')

    expect(routes.map((route) => route.method).sort()).toEqual([
      'DELETE',
      'GET',
      'PATCH',
      'POST',
      'PUT',
    ])
    for (const route of routes) {
      expect(AttributeFactory.get(AccessAttribute, route)).toBe('public')
      expect(AttributeFactory.has(OPENAPI_EXCLUDE, route)).toBe(true)
    }
  })
})
