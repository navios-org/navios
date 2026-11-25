import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import { Controller, handler, Module, NaviosFactory } from '@navios/server'

import type { NaviosApplication } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunCorsOptions, BunEnvironment, OriginFunction } from '../src/index.mjs'

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
      varied = handler(
        { config: { method: 'GET', url: '/varied', responseSchema: okSchema } } as any,
        (_: any, ctx: any) => {
          ctx.reply.header('vary', 'Accept-Encoding')
          return { ok: true }
        },
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

  it('sends Vary: Origin whether or not the origin is allowed', async () => {
    const allowed = await fetch(`${base}/ping`, { headers: { origin: 'https://app.example' } })
    expect(allowed.headers.get('vary')).toBe('Origin')
    const other = await fetch(`${base}/ping`, { headers: { origin: 'https://evil.example' } })
    expect(other.headers.get('vary')).toBe('Origin')
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
    const none = await fetch(`${base}/ping`)
    expect(none.headers.get('vary')).toBe('Origin')
    const preflight = await fetch(`${base}/ping`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    })
    expect(preflight.headers.get('vary')).toBe('Origin')
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('keeps a Vary header set by the handler', async () => {
    for (const origin of ['https://app.example', 'https://evil.example']) {
      const response = await fetch(`${base}/varied`, { headers: { origin } })
      expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
    }
  })
})

describe('bun adapter: CORS with a function for the origin', () => {
  const logger = { log: mock(), error: mock(), warn: mock(), debug: mock() }
  const calls: string[] = []
  let app: NaviosApplication<BunEnvironment> | null = null

  const start = async (cors: BunCorsOptions) => {
    class CallController {
      call = handler({ config: { method: 'GET', url: '/call' } } as any, () => {
        calls.push('handler')
        return { ok: true }
      })
    }
    decorate(CallController, Controller())
    class AppModule {}
    decorate(AppModule, Module({ controllers: [CallController] }))
    app = await NaviosFactory.create(AppModule, { adapter: defineBunEnvironment({ cors }), logger })
    return app.listen({ port: 0, hostname: '127.0.0.1' })
  }
  const call = (base: string, origin: string, init: RequestInit = {}) =>
    fetch(`${base}/call`, { signal: AbortSignal.timeout(2000), headers: { origin }, ...init })
  const preflight = (base: string, origin: string) =>
    call(base, origin, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'PUT' },
    })

  beforeEach(() => {
    calls.length = 0
    logger.error.mockClear()
  })

  afterEach(async () => {
    await app?.close()
    app = null
  })

  const A = 'https://a.test'
  const deciders: Record<string, OriginFunction> = {
    'the callback': (origin, callback) => callback(null, origin === A),
    'the callback, later': (origin, callback) => {
      setTimeout(callback, 5, null, origin === A)
    },
    'an async function and the callback': async (origin, callback) => {
      await Bun.sleep(1)
      callback(null, origin === A)
    },
    'a promise': async (origin) => origin === A,
    'a value': (origin) => origin === A,
    'an origin': (_origin, callback) => callback(null, A),
    'a pattern': (_origin, callback) => callback(null, /a\.test$/),
    'a list': async () => ['https://c.test', /a\.test$/],
  }
  for (const [name, origin] of Object.entries(deciders)) {
    it(`takes the answer of ${name}`, async () => {
      const base = await start({ origin, credentials: true })
      const allowed = await call(base, A)
      expect(allowed.status).toBe(200)
      expect(allowed.headers.get('access-control-allow-origin')).toBe(A)
      expect(allowed.headers.get('vary')).toBe('Origin')
      const refused = await call(base, 'https://b.test')
      expect(refused.status).toBe(200)
      expect(refused.headers.get('access-control-allow-origin')).toBeNull()
      expect(refused.headers.get('vary')).toBe('Origin')
      const answer = await preflight(base, A)
      expect(answer.status).toBe(204)
      expect(answer.headers.get('access-control-allow-origin')).toBe(A)
      // Without an origin there is nothing to decide about.
      expect((await fetch(`${base}/call`)).status).toBe(200)
    })
  }

  // What such a function returns is what its expression happens to be: `true`
  // of an emitter that has a listener, or the id of a timer.
  const returning: Record<string, OriginFunction> = {
    'true before it has decided': (origin, callback) => {
      setTimeout(callback, 5, null, origin === A)
      return true
    },
    'a list before it has decided': (origin, callback) => {
      setTimeout(callback, 5, null, origin === A)
      return [A, 'https://b.test']
    },
    'true after it has decided': (origin, callback) => {
      callback(null, origin === A)
      return true
    },
    'false before it has decided': (origin, callback) => {
      setTimeout(callback, 5, null, origin === A)
      return false
    },
  }
  for (const [name, origin] of Object.entries(returning)) {
    it(`takes the answer of the callback of a function that returns ${name}`, async () => {
      const base = await start({ origin, credentials: true })
      expect((await call(base, A)).headers.get('access-control-allow-origin')).toBe(A)
      const refused = await call(base, 'https://b.test')
      expect(refused.status).toBe(200)
      expect(refused.headers.get('access-control-allow-origin')).toBeNull()
      expect((await preflight(base, 'https://b.test')).status).not.toBe(204)
    })
  }

  it('does not allow an origin when a function that takes no callback returns nothing', async () => {
    const base = await start({ origin: (origin) => (origin === A ? true : undefined) })
    expect((await call(base, A)).headers.get('access-control-allow-origin')).toBe(A)
    const refused = await call(base, 'https://b.test')
    expect(refused.status).toBe(200)
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not allow an origin when an async function answers with nothing', async () => {
    const base = await start({ origin: async () => {} })
    expect((await call(base, A)).headers.get('access-control-allow-origin')).toBeNull()
  })

  const failing: Record<string, BunCorsOptions> = {
    throws: {
      origin: () => {
        throw new Error('the origin check failed')
      },
    },
    rejects: { origin: () => Promise.reject(new Error('the origin check failed')) },
    'calls back with an error': {
      origin: (_origin, callback) => callback(new Error('the origin check failed')),
    },
    'allows any origin with credentials': {
      origin: (_origin, callback) => callback(null, '*'),
      credentials: true,
    },
  }
  for (const [name, options] of Object.entries(failing)) {
    it(`answers 500 problem+json, without calling the handler, when it ${name}`, async () => {
      const base = await start(options)
      for (const response of [await call(base, A), await preflight(base, A)]) {
        expect(response.status).toBe(500)
        expect(response.headers.get('content-type')).toContain('application/problem+json')
        expect(response.headers.get('access-control-allow-origin')).toBeNull()
        expect(response.headers.get('vary')).toBe('Origin')
      }
      expect(calls).toEqual([])
      expect(logger.error.mock.calls.map(([message]) => message)).toEqual([
        'Unhandled error in GET /call',
        'Unhandled error in OPTIONS /call',
      ])
    })
  }
})

describe('bun adapter: CORS options', () => {
  class AppModule {}
  decorate(AppModule, Module({ controllers: [] }))

  it('rejects a wildcard origin in a list together with credentials', async () => {
    for (const origin of ['*', ['*'], ['https://app.example', '*']]) {
      expect(() =>
        defineBunEnvironment({ cors: { origin, credentials: true } }).create({} as any),
      ).toThrow('[Navios] CORS with credentials needs an explicit origin')
    }
  })

  it('gives the same answer to every request for a pattern with a flag', async () => {
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment({ cors: { origin: [/^https:\/\/a\.test$/g] } }),
      logger: false,
    })
    const base = await app.listen({ port: 0, hostname: '127.0.0.1' })
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${base}/nope`, { headers: { origin: 'https://a.test' } })
      expect(response.headers.get('access-control-allow-origin')).toBe('https://a.test')
    }
    await app.close()
  })

  it('answers a preflight request to a path with an OPTIONS route of its own', async () => {
    class OptionsController {
      options = handler({ config: { method: 'OPTIONS', url: '/own' } } as any, () => ({ own: 1 }))
      put = handler({ config: { method: 'PUT', url: '/own' } } as any, () => ({}))
    }
    decorate(OptionsController, Controller())
    class OptionsModule {}
    decorate(OptionsModule, Module({ controllers: [OptionsController] }))
    const app = await NaviosFactory.create(OptionsModule, {
      adapter: defineBunEnvironment({ cors: { origin: ['https://a.test'] } }),
      logger: false,
    })
    const base = await app.listen({ port: 0, hostname: '127.0.0.1' })
    const headers = { origin: 'https://a.test', 'access-control-request-method': 'PUT' }
    const preflight = await fetch(`${base}/own`, { method: 'OPTIONS', headers })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT')
    const injected = await app.inject({ method: 'OPTIONS', url: '/own', headers })
    expect(injected.status).toBe(204)
    const own = await fetch(`${base}/own`, { method: 'OPTIONS' })
    expect(await own.json()).toEqual({ own: 1 })
    await app.close()
  })

  it('does not send Vary: Origin for a wildcard origin', async () => {
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment({ cors: { origin: ['*'] } }),
      logger: false,
    })
    const base = await app.listen({ port: 0, hostname: '127.0.0.1' })
    const response = await fetch(`${base}/nope`, { headers: { origin: 'https://a.example' } })
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('vary')).toBeNull()
    await app.close()
  })
})
