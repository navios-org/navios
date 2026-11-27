import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyAdapterOptions, FastifyEnvironment } from '../src/index.mjs'

// The options go to `@fastify/cors` as they are, and so do its defaults. These
// are the ones in which the plugin differs from the CORS of the other adapters.
describe('fastify adapter: the options of @fastify/cors', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let calls: number

  const create = async (cors: FastifyAdapterOptions['cors']) => {
    calls = 0
    class ThingController {
      get = handler({ config: { method: 'GET', url: '/things/$id' } } as never, () => ({}))
      options = handler({ config: { method: 'OPTIONS', url: '/things/$id' } } as never, () => {
        calls++
        return { own: true }
      })
    }
    registerController(ThingController)
    class AppModule {}
    registerModule(AppModule, { controllers: [ThingController] })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ cors }),
      logger: false,
    })
    await app.init()
  }

  afterEach(async () => {
    await app.close()
  })

  const preflight = { origin: 'https://a.test', 'access-control-request-method': 'PUT' }

  it('answers an OPTIONS request that is not a preflight with 400 by default', async () => {
    await create({ origin: ['https://a.test'] })
    const response = await app.inject({ method: 'OPTIONS', url: '/things/1' })
    expect(response.status).toBe(400)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.text).toBe('Invalid Preflight Request')
    expect(calls).toBe(0)
  })

  it('answers every OPTIONS request itself when only strictPreflight is off', async () => {
    await create({ origin: ['https://a.test'], strictPreflight: false })
    const response = await app.inject({ method: 'OPTIONS', url: '/things/1' })
    expect(response.status).toBe(204)
    expect(calls).toBe(0)
  })

  it('runs an OPTIONS route with strictPreflight off and preflightContinue on', async () => {
    await create({ origin: ['https://a.test'], strictPreflight: false, preflightContinue: true })
    const own = await app.inject({ method: 'OPTIONS', url: '/things/1' })
    expect(own.status).toBe(200)
    expect(own.body).toEqual({ own: true })
    expect(calls).toBe(1)

    // A preflight request on that path goes to the route as well, with the headers of the plugin.
    const routed = await app.inject({ method: 'OPTIONS', url: '/things/1', headers: preflight })
    expect(routed.status).toBe(200)
    expect(routed.headers['access-control-allow-origin']).toBe('https://a.test')
    expect(routed.headers['access-control-allow-methods']).toBe('GET,HEAD,POST')
    expect(calls).toBe(2)

    // On a path without an OPTIONS route the route of the plugin answers a
    // preflight request, with 200 where its hook answers with 204.
    const other = await app.inject({ method: 'OPTIONS', url: '/elsewhere', headers: preflight })
    expect(other.status).toBe(200)
    expect(other.text).toBe('')
    expect(other.headers['access-control-allow-origin']).toBe('https://a.test')

    // A url that the router rejects is answered by the adapter, after the plugin.
    const malformed = await app.inject({
      method: 'OPTIONS',
      url: '/things/%zz',
      headers: preflight,
    })
    expect(malformed.status).toBe(400)
    expect(malformed.headers['content-type']).toContain('application/problem+json')
    expect(malformed.headers['access-control-allow-origin']).toBe('https://a.test')
  })

  it('answers a preflight request of an origin that is not allowed without naming it', async () => {
    await create({ origin: ['https://a.test'] })
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/things/1',
      headers: { ...preflight, origin: 'https://b.test' },
    })
    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(calls).toBe(0)
  })

  it('takes credentials with any origin, which browsers reject', async () => {
    await create({ credentials: true })
    const response = await app.inject({
      method: 'GET',
      url: '/things/1',
      headers: { origin: 'https://a.test' },
    })
    expect(response.headers['access-control-allow-origin']).toBe('*')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })
})
