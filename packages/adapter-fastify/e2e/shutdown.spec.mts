import http from 'node:http'
import https from 'node:https'
import { connect } from 'node:net'
import { connect as connectTls } from 'node:tls'

import {
  handler,
  inject,
  NaviosFactory,
  registerController,
  registerInjectable,
  registerModule,
} from '@navios/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NaviosApplication, RequestContext } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyAdapterOptions, FastifyEnvironment } from '../src/index.mjs'

const any = {
  '~standard': { version: 1 as const, vendor: 'test', validate: (value: unknown) => ({ value }) },
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('fastify adapter: closing with keep-alive clients', () => {
  let app: NaviosApplication<FastifyEnvironment>
  let port: number
  let agent: http.Agent
  let started: () => void
  let start: Promise<void>

  const get = (path: string) =>
    new Promise<http.IncomingMessage>((resolve, reject) => {
      http
        .get({ port, host: '127.0.0.1', path, agent }, (response) => {
          response.resume()
          response.on('end', () => resolve(response))
        })
        .on('error', reject)
    })

  const timeToClose = async () => {
    const from = Date.now()
    await app.close()
    return Date.now() - from
  }

  beforeEach(async () => {
    start = new Promise((resolve) => {
      started = resolve
    })

    class SlowController {
      slow = handler(
        { config: { method: 'GET', url: '/slow', responseSchema: any } } as never,
        async () => {
          started()
          await pause(50)
          return { done: true }
        },
      )

      stream = handler(
        { config: { method: 'GET', url: '/stream', response: 'stream' } } as never,
        async function* () {
          yield 'a'
          started()
          await pause(50)
          yield 'b'
        } as never,
      )
    }
    registerController(SlowController)
    class AppModule {}
    registerModule(AppModule, { controllers: [SlowController] })

    agent = new http.Agent({ keepAlive: true })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
      shutdownTimeout: 3000,
    })
    port = Number(new URL(await app.listen({ port: 0, host: '127.0.0.1' })).port)
  })

  afterEach(async () => {
    agent.destroy()
    await app.close()
  })

  it('does not wait for the connection of a request that was in flight', async () => {
    const pending = get('/slow')
    await start
    const closing = timeToClose()
    const response = await pending
    expect(response.statusCode).toBe(200)
    expect(response.headers.connection).toBe('close')
    expect(await closing).toBeLessThan(1000)
  })

  it('does not wait for the connection of a stream that was being sent', async () => {
    const pending = get('/stream')
    await start
    const closing = timeToClose()
    expect((await pending).statusCode).toBe(200)
    expect(await closing).toBeLessThan(1000)
  })

  it('does not wait for a connection that never sent a request', async () => {
    const socket = connect({ port, host: '127.0.0.1' })
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    // Let the server accept it.
    await get('/slow')
    expect(await timeToClose()).toBeLessThan(1000)
    socket.destroy()
  })
})

describe('fastify adapter: closing by force', () => {
  it('aborts the requests before anything is disposed', async () => {
    const events: string[] = []
    class Pool {
      onServiceDestroy() {
        events.push('container')
      }
    }
    registerInjectable(Pool)
    let started = () => {}
    const start = new Promise<void>((resolve) => {
      started = resolve
    })
    class StuckController {
      pool = inject(Pool)
      stuck = handler(
        { config: { method: 'GET', url: '/stuck' } } as never,
        async (_params: unknown, ctx: RequestContext) => {
          ctx.signal.addEventListener('abort', () => events.push('abort'))
          ctx.onFinish(() => {
            events.push('finish')
          })
          started()
          await new Promise(() => {})
        },
      )
    }
    registerController(StuckController)
    class AppModule {}
    registerModule(AppModule, { controllers: [StuckController] })
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(),
      logger: false,
      shutdownTimeout: 50,
    })
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const pending = fetch(`${address}/stuck`).catch(() => null)
    await start
    await app.close()
    expect(events).toEqual(['abort', 'finish', 'container'])
    await pending
  })
})

describe('fastify adapter: closing with TLS clients', () => {
  const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgKSd4Ux+e0yw82Kzq
09C61L918E3LfwOzhbc9ilNZ5QqhRANCAASV+zJLDeWdWU79pTkPF2PaEPcp2yTT
Nr0E73yLFil1/VIDZDIIvJReWIDhUP82u7V4E3SRxPukgRtSzuMw/vZr
-----END PRIVATE KEY-----`
  const cert = `-----BEGIN CERTIFICATE-----
MIIBXzCCAQSgAwIBAgIUNoZJWzz428xEgA2rN78DLwyvHXAwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTEyNTE0MzIyNloYDzIxMjYxMTAx
MTQzMjI2WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAASV+zJLDeWdWU79pTkPF2PaEPcp2yTTNr0E73yLFil1/VIDZDIIvJRe
WIDhUP82u7V4E3SRxPukgRtSzuMw/vZrozIwMDAdBgNVHQ4EFgQUX+oucHHUblvy
HJpok9mYOyTHxqAwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEA
3tJYeczoEl2L04PmG1CaKVoFVCHoAEm0B2eJ51vYThYCIQDxDFS12D7A/EbMOwYt
YfEJILmtDdO7GtDBWRNn3jujTQ==
-----END CERTIFICATE-----`

  it('does not wait for a connection that never sent a request', async () => {
    class SlowController {
      slow = handler({ config: { method: 'GET', url: '/slow' } } as never, async () => {
        await pause(100)
        return { done: true }
      })
    }
    registerController(SlowController)
    class AppModule {}
    registerModule(AppModule, { controllers: [SlowController] })
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ https: { key, cert } }),
      logger: false,
      shutdownTimeout: 3000,
    })
    const { port } = new URL(await app.listen({ port: 0, host: '127.0.0.1' }))
    const options = { port: Number(port), host: '127.0.0.1', rejectUnauthorized: false }
    const socket = connectTls(options)
    socket.on('error', () => {})
    await new Promise<void>((resolve) => socket.once('secureConnect', resolve))
    const status = new Promise((resolve, reject) => {
      https
        .get({ ...options, path: '/slow' }, (response) => {
          response.resume().on('end', () => resolve(response.statusCode))
        })
        .on('error', reject)
    })
    await pause(30)
    const from = Date.now()
    await app.close()
    expect(Date.now() - from).toBeLessThan(1000)
    expect(await status).toBe(200)
    socket.destroy()
  })
})

describe('fastify adapter: closing with what Fastify does not close', () => {
  class AppModule {}
  registerModule(AppModule, {})

  const start = async (configure: FastifyAdapterOptions['configure']) => {
    const app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment({ configure }),
      logger: false,
      shutdownTimeout: 100,
    })
    return { app, url: new URL(await app.listen({ port: 0, host: '127.0.0.1' })) }
  }

  it('drops a connection that was upgraded, once the timeout has passed', async () => {
    const { app, url } = await start((server) => {
      server.server.on('upgrade', (_request, socket) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\nconnection: upgrade\r\n\r\n')
      })
    })
    const socket = connect(Number(url.port), url.hostname)
    socket.on('error', () => {})
    const closed = new Promise<void>((resolve) => socket.once('close', resolve))
    const upgraded = new Promise<void>((resolve) => socket.once('data', () => resolve()))
    socket.write('GET / HTTP/1.1\r\nhost: x\r\nconnection: upgrade\r\nupgrade: x\r\n\r\n')
    await upgraded
    const from = Date.now()
    await app.close()
    await closed
    expect(Date.now() - from).toBeGreaterThan(90)
    expect(Date.now() - from).toBeLessThan(1000)
  })

  it('does not wait for ever for a plugin that does not close', async () => {
    const { app } = await start((server) => {
      server.addHook('onClose', () => new Promise<void>(() => {}))
    })
    const from = Date.now()
    await app.close()
    expect(Date.now() - from).toBeLessThan(2500)
  })
})
