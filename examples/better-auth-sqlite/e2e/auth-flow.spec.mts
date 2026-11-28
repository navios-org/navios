import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { NaviosApplication } from '@navios/server'

import { Auth } from '../src/auth.mjs'
import { createApp } from '../src/create-app.mjs'

// The origin Better Auth trusts: that of BETTER_AUTH_URL, whatever port the test listens on.
const ORIGIN = 'http://localhost:3000'

describe('notes behind Better Auth, on Bun', () => {
  let dir: string
  let app: NaviosApplication<any>
  let base: string

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'navios-better-auth-flow-'))
    process.env.DATABASE_PATH = join(dir, 'app.db')
    process.env.BETTER_AUTH_URL = ORIGIN
    app = await createApp({ logger: false })
    await app.init()
    // What `yarn auth:migrate` does, on the instance the application built.
    await (await (await app.get(Auth)).$context).runMigrations()
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterEach(async () => {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.DATABASE_PATH
    delete process.env.BETTER_AUTH_URL
  })

  async function call(
    path: string,
    init: { method?: string; cookie?: string; body?: unknown } = {},
  ) {
    const headers: Record<string, string> = { origin: ORIGIN }
    if (init.cookie) {
      headers.cookie = init.cookie
    }
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const text = await response.text()
    return { status: response.status, cookie, body: text === '' ? undefined : JSON.parse(text) }
  }

  async function signUp(email: string) {
    const response = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email, password: 'correct horse battery', name: email },
    })
    expect(response.status).toBe(200)
    return response.cookie
  }

  it('should keep the notes of a signed-in user to that user', async () => {
    const ada = await signUp('ada@example.com')

    const me = await call('/me', { cookie: ada })
    const empty = await call('/notes', { cookie: ada })
    const created = await call('/notes', { method: 'POST', cookie: ada, body: { text: 'Hello' } })
    const listed = await call('/notes', { cookie: ada })
    const grace = await signUp('grace@example.com')
    const othersNotes = await call('/notes', { cookie: grace })

    expect(me.body).toMatchObject({ email: 'ada@example.com', plan: 'free' })
    expect(empty.body).toEqual([])
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({ text: 'Hello' })
    expect(listed.body).toEqual([created.body])
    expect(othersNotes.body).toEqual([])
  })

  it('should answer without a session with 401', async () => {
    const response = await call('/notes')

    expect(response.status).toBe(401)
  })

  it('should end the session on sign-out', async () => {
    const ada = await signUp('ada@example.com')

    const signOut = await call('/api/auth/sign-out', { method: 'POST', cookie: ada })
    const after = await call('/notes', { cookie: ada })

    expect(signOut.status).toBe(200)
    expect(after.status).toBe(401)
  })

  it('should sign in again with the password', async () => {
    await signUp('ada@example.com')

    const signIn = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'ada@example.com', password: 'correct horse battery' },
    })
    const wrong = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'ada@example.com', password: 'wrong horse battery' },
    })

    expect(signIn.status).toBe(200)
    expect((await call('/me', { cookie: signIn.cookie })).body).toMatchObject({
      email: 'ada@example.com',
    })
    expect(wrong.status).toBe(401)
  })
})
