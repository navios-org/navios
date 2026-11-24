import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { Controller, handler, Module, NaviosFactory } from '@navios/core'

import type { NaviosApplication } from '@navios/core'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

const decorate = <T,>(target: T, decorator: (target: any, context: any) => unknown): T => {
  decorator(target, { kind: 'class', name: (target as { name: string }).name, metadata: {} })
  return target
}

const okSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
}

describe('bun adapter: CORS', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string

  beforeAll(async () => {
    class PingController {
      ping = handler(
        { config: { method: 'GET', url: '/ping', responseSchema: okSchema } } as any,
        () => ({ ok: true }),
      )
    }
    decorate(PingController, Controller())
    class AppModule {}
    decorate(AppModule, Module({ controllers: [PingController] }))

    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment({
        cors: { origin: 'https://app.example', credentials: true, methods: ['GET', 'POST'] },
      }),
      logger: false,
    })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers a preflight request', async () => {
    const response = await fetch(`${base}/ping`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'GET',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(response.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('adds CORS headers to responses for an allowed origin only', async () => {
    const allowed = await fetch(`${base}/ping`, { headers: { origin: 'https://app.example' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')

    const other = await fetch(`${base}/ping`, { headers: { origin: 'https://evil.example' } })
    expect(other.status).toBe(200)
    expect(other.headers.get('access-control-allow-origin')).toBeNull()

    const missing = await fetch(`${base}/nope`, { headers: { origin: 'https://app.example' } })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('access-control-allow-origin')).toBe('https://app.example')
  })
})
