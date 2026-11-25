import { builder } from '@navios/builder'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { createApplication } from '../application/application.mjs'
import {
  Controller,
  definePlugin,
  handler,
  httpTransport,
  Injectable,
  Module,
  NaviosFactory,
  NotFoundException,
} from '../index.mjs'
import { defineInMemoryEnvironment, InMemoryAdapter } from '../testing/index.mjs'

import type { AdapterDefinition, ExecutionContext, HttpAdapterEnvironment } from '../index.mjs'

import { fakeTransport } from './helpers/fake-transport.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const api = builder()

const ping = api.declareEndpoint({
  method: 'GET',
  url: '/ping',
  responseSchema: z.object({ ok: z.boolean() }),
})

@Controller()
class Ping {
  ping = handler(ping, () => ({ ok: true }))
}

const closers: Array<{ close(): Promise<void> }> = []

afterEach(async () => {
  while (closers.length > 0) {
    await closers.pop()!.close()
  }
  vi.unstubAllEnvs()
})

function track<T extends { close(): Promise<void> }>(app: T): T {
  closers.push(app)
  return app
}

interface ListeningEnvironment extends HttpAdapterEnvironment {
  server: null
  listenOptions: { port: number }
}

/** The in-memory adapter with a `listen` that counts its calls. */
function defineListeningEnvironment(calls: number[]): AdapterDefinition<ListeningEnvironment> {
  return {
    name: 'listening',
    create(context) {
      const adapter = new InMemoryAdapter(context.errors) as any
      adapter.listen = async (options: { port: number }) => {
        calls.push(options.port)
        return `http://localhost:${options.port}/${calls.length}`
      }
      return adapter
    },
  }
}

function hasFrames(error: Error): boolean {
  return /\n\s+at /.test(error.stack ?? '')
}

describe('httpTransport', () => {
  it('serves from a kernel application', async () => {
    @Module({ controllers: [Ping] })
    class Root {}

    const app = track(
      createApplication(Root, {
        logger: false,
        transports: [httpTransport({ adapter: defineInMemoryEnvironment() })],
      }),
    )
    await app.init()
    const http = app.transport(httpTransport)

    const response = await http.inject({ method: 'GET', url: '/ping' })

    expect(response.status).toBe(200)
    expect(http.routes().map((route) => route.path)).toEqual(['/ping'])
  })

  it('serves a module that also lists a key nobody reads', async () => {
    class Cmd {}
    @Module({ controllers: [Ping], commands: [Cmd] } as any)
    class Root {}

    const app = track(
      await NaviosFactory.create(Root, { adapter: defineInMemoryEnvironment(), logger: false }),
    )

    expect((await app.inject({ method: 'GET', url: '/ping' })).status).toBe(200)
  })

  it('starts the other transports on listen, and only once', async () => {
    @Module({ controllers: [Ping] })
    class Root {}
    const log: string[] = []
    const calls: number[] = []

    const app = track(
      await NaviosFactory.create(Root, {
        adapter: defineListeningEnvironment(calls),
        logger: false,
        transports: [fakeTransport({ kind: 'q', entry: 'jobs', log })],
      }),
    )

    await app.inject({ method: 'GET', url: '/ping' })
    expect(log).not.toContain('q:start')

    const first = await app.listen({ port: 3000 })
    const second = await app.listen({ port: 3000 })
    await app.start()

    expect(second).toBe(first)
    expect(calls).toEqual([3000])
    expect(log.filter((line) => line === 'q:start')).toHaveLength(1)
  })

  it('listens on start when listen options are given', async () => {
    @Module({ controllers: [Ping] })
    class Root {}
    const calls: number[] = []

    const app = track(
      createApplication(Root, {
        logger: false,
        transports: [
          httpTransport({ adapter: defineListeningEnvironment(calls), listen: { port: 4000 } }),
        ],
      }),
    )
    await app.start()
    await app.start()

    expect(calls).toEqual([4000])
  })

  it('applies http.intercept to routes only', async () => {
    const seen: string[] = []

    @Injectable()
    class HttpOnly {
      async intercept(ctx: ExecutionContext, next: () => Promise<unknown>) {
        seen.push(`http-only:${ctx.kind}`)
        return next()
      }
    }
    @Injectable()
    class Everywhere {
      async intercept(ctx: ExecutionContext, next: () => Promise<unknown>) {
        seen.push(`everywhere:${ctx.kind}`)
        return next()
      }
    }
    class Job {}
    @Module({ controllers: [Ping], jobs: [Job] } as any)
    class Root {}
    const plugin = definePlugin({
      name: 'interceptors',
      setup(pluginApi) {
        pluginApi.transport(httpTransport)!.intercept(HttpOnly)
        pluginApi.intercept(Everywhere)
      },
    })

    const app = track(
      createApplication(Root, {
        logger: false,
        plugins: [plugin()],
        transports: [
          httpTransport({ adapter: defineInMemoryEnvironment() }),
          fakeTransport({ kind: 'q', entry: 'jobs', log: [] }),
        ],
      }),
    )
    await app.init()

    await app.transport(httpTransport).inject({ method: 'GET', url: '/ping' })
    await app.transport(fakeTransport).run(Job)

    expect(seen).toEqual(['everywhere:http', 'http-only:http', 'everywhere:q'])
  })

  it('keeps intercept() on the HTTP application for routes only', async () => {
    const seen: string[] = []

    @Injectable()
    class Recorder {
      async intercept(ctx: ExecutionContext, next: () => Promise<unknown>) {
        seen.push(ctx.kind)
        return next()
      }
    }
    class Job {}
    @Module({ controllers: [Ping], jobs: [Job] } as any)
    class Root {}

    const app = track(
      await NaviosFactory.create(Root, {
        adapter: defineInMemoryEnvironment(),
        logger: false,
        transports: [fakeTransport({ kind: 'q', entry: 'jobs', log: [] })],
      }),
    )
    app.intercept(Recorder)

    await app.inject({ method: 'GET', url: '/ping' })
    await app.transport(fakeTransport).run(Job)

    expect(seen).toEqual(['http'])
  })

  it('releases client error stacks when another transport fails setup', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    @Module({ controllers: [Ping] })
    class Root {}

    const failing = await NaviosFactory.create(Root, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      clientErrorStacks: 'always',
      transports: [fakeTransport({ kind: 'q', entry: 'jobs', log: [], failSetup: true })],
    })
    await expect(failing.init()).rejects.toThrow('q setup failed')

    const quiet = track(
      await NaviosFactory.create(Root, {
        adapter: defineInMemoryEnvironment(),
        logger: false,
        clientErrorStacks: 'never',
      }),
    )
    await quiet.init()

    // Stacks are captured while any running application wants them.
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
    await failing.close()
  })

  it('gives plugins the routes through the transport', async () => {
    @Module({ controllers: [Ping] })
    class Root {}
    let seen = -1
    const plugin = definePlugin({
      name: 'routes',
      setup(pluginApi) {
        pluginApi.onBootstrap(() => {
          seen = pluginApi.transport(httpTransport)!.routes().length
        })
      },
    })

    const app = track(
      await NaviosFactory.create(Root, {
        adapter: defineInMemoryEnvironment(),
        logger: false,
        plugins: [plugin()],
      }),
    )
    await app.init()

    expect(seen).toBe(1)
  })

  it('maps errors registered before and after init', async () => {
    class Early extends Error {}
    class Late extends Error {}
    const early = api.declareEndpoint({ method: 'GET', url: '/early', response: 'text' })
    const late = api.declareEndpoint({ method: 'GET', url: '/late', response: 'text' })

    @Controller()
    class Throwing {
      early = handler(early, () => {
        throw new Early()
      })
      late = handler(late, () => {
        throw new Late()
      })
    }
    @Module({ controllers: [Throwing] })
    class Root {}

    const app = track(
      await NaviosFactory.create(Root, { adapter: defineInMemoryEnvironment(), logger: false }),
    )
    app.mapError(Early, () => ({ status: 418, kind: 'text', body: 'early' }) as any)
    await app.init()
    app.mapError(Late, () => ({ status: 419, kind: 'text', body: 'late' }) as any)

    expect((await app.inject({ method: 'GET', url: '/early' })).status).toBe(418)
    expect((await app.inject({ method: 'GET', url: '/late' })).status).toBe(419)
  })

  it('lets listen() be tried again after it failed', async () => {
    @Module({ controllers: [Ping] })
    class Root {}
    const attempts: number[] = []
    const definition: AdapterDefinition<ListeningEnvironment> = {
      name: 'busy-port',
      create(context) {
        const adapter = new InMemoryAdapter(context.errors) as any
        adapter.listen = async (options: { port: number }) => {
          attempts.push(options.port)
          if (options.port === 3000) {
            throw new Error('EADDRINUSE')
          }
          return `http://localhost:${options.port}`
        }
        return adapter
      },
    }
    const app = track(await NaviosFactory.create(Root, { adapter: definition, logger: false }))

    await expect(app.listen({ port: 3000 })).rejects.toThrow('EADDRINUSE')

    expect(await app.listen({ port: 3001 })).toBe('http://localhost:3001')
    expect(attempts).toEqual([3000, 3001])
  })
})
