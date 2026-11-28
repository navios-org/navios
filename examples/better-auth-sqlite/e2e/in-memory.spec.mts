import { afterEach, beforeEach, expect, it } from 'bun:test'

import { betterAuthPlugin } from '@navios/better-auth'
import { NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'

import type { NaviosApplication } from '@navios/server'

import { AppModule } from '../src/app.module.mjs'
import { Auth } from '../src/auth.mjs'

// The test of the Better Auth guide: the application on the in-memory adapter, with a database
// that lives as long as the test.
let app: NaviosApplication<any>

beforeEach(async () => {
  process.env.DATABASE_PATH = ':memory:'
  app = await NaviosFactory.create(AppModule, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    plugins: [betterAuthPlugin({ auth: Auth })],
  })
  await app.init()
  const auth = await app.get(Auth)
  await (await auth.$context).runMigrations()
})

afterEach(async () => {
  await app.close()
  delete process.env.DATABASE_PATH
})

it('keeps notes to the user who wrote them', async () => {
  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    body: { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' },
  })
  const cookie = signUp.cookies.map((value) => value.split(';')[0]).join('; ')

  await app.inject({ method: 'POST', url: '/notes', headers: { cookie }, body: { text: 'Hello' } })
  const notes = await app.inject({ method: 'GET', url: '/notes', headers: { cookie } })
  const anonymous = await app.inject({ method: 'GET', url: '/notes' })

  expect(notes.body).toMatchObject([{ text: 'Hello' }])
  expect(anonymous.status).toBe(401)
})
