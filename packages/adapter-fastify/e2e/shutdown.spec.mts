import http from 'node:http'
import { connect } from 'node:net'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/core'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyEnvironment } from '../src/index.mjs'

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
