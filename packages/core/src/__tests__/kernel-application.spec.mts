import { afterEach, describe, expect, it } from 'vitest'

import { createApplication } from '../application/application.mjs'
import { Injectable } from '../index.mjs'
import { registerModule } from '../modules/index.mjs'
import { definePlugin } from '../plugins/index.mjs'
import { fakeTransport } from '../testing/index.mjs'
import { defineTransport } from '../transports/index.mjs'

import type { ApplicationOptions } from '../application/application-options.mjs'
import type { Application } from '../application/application.mjs'
import type { ExecutionContext } from '../execution/execution-context.mjs'
import type { Guard } from '../guards/guard.mjs'
import type { ModuleOptions } from '../modules/index.mjs'
import type { FakeTransport } from '../testing/index.mjs'

const apps: Application[] = []

function create(module: new () => unknown, options: ApplicationOptions = {}) {
  const app = createApplication(module, { logger: false, ...options })
  apps.push(app)
  return app
}

function module(name: string, options: ModuleOptions & Record<string, unknown> = {}) {
  const target = { [name]: class {} }[name]
  return registerModule(target, options as ModuleOptions)
}

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

describe('Application', () => {
  it('runs init, start and close in order', async () => {
    const log: string[] = []

    @Injectable()
    class Service {
      onApplicationBootstrap() {
        log.push('service:bootstrap')
      }
      onApplicationShutdown() {
        log.push('service:shutdown')
      }
    }
    class Root {
      onModuleInit() {
        log.push('module:init')
      }
    }
    registerModule(Root, {})
    const plugin = definePlugin({
      name: 'recorder',
      async setup(api) {
        log.push('plugin:setup')
        await api.container.get(Service)
        api.onBootstrap(() => {
          log.push('plugin:bootstrap')
        })
        api.onShutdown(() => {
          log.push('plugin:shutdown')
        })
      },
    })

    const app = create(Root, {
      plugins: [plugin()],
      transports: [
        fakeTransport({ kind: 'a', entry: 'as', log }, 'a'),
        fakeTransport({ kind: 'b', entry: 'bs', log }, 'b'),
      ],
    })
    await app.start()
    await app.close()

    expect(log).toEqual([
      'a:create',
      'b:create',
      'plugin:setup',
      'module:init',
      'a:setup',
      'b:setup',
      'plugin:bootstrap',
      'service:bootstrap',
      'a:start',
      'b:start',
      'a:stop',
      'b:stop',
      'service:shutdown',
      'plugin:shutdown',
    ])
  })

  it('gives each transport only its own entries and ignores unread keys', async () => {
    class Cmd {}
    class Job {}
    class Unread {}
    const Root = module('Root', { commands: [Cmd], jobs: [Job], unread: [Unread] })
    const log: string[] = []

    const app = create(Root, {
      transports: [
        fakeTransport({ kind: 'cli', entry: 'commands', log }, 'cli'),
        fakeTransport({ kind: 'jobs', entry: 'jobs', log }, 'jobs'),
      ],
    })
    await app.init()

    expect(app.transport(fakeTransport, 'cli').handlers).toEqual([Cmd])
    expect(app.transport(fakeTransport, 'jobs').handlers).toEqual([Job])
  })

  it('boots with no transports', async () => {
    const app = create(module('Root'))

    await expect(app.start()).resolves.toBe(app)
  })

  it('starts each transport once', async () => {
    const log: string[] = []
    const app = create(module('Root'), {
      transports: [fakeTransport({ kind: 'a', entry: 'as', log })],
    })

    await app.start()
    await app.start()

    expect(log.filter((line) => line === 'a:start')).toHaveLength(1)
  })

  it('stops the others when one stop rejects', async () => {
    const log: string[] = []

    @Injectable()
    class Service {
      onApplicationShutdown() {
        log.push('service:shutdown')
      }
    }
    const app = create(module('Root'), {
      transports: [
        fakeTransport({ kind: 'a', entry: 'as', log, failStop: true }, 'a'),
        fakeTransport({ kind: 'b', entry: 'bs', log }, 'b'),
      ],
    })
    await app.init()
    await app.get(Service)

    await app.close()

    expect(log).toContain('b:stop')
    expect(log).toContain('service:shutdown')
  })

  it('stops created transports and stays failed when setup throws', async () => {
    const log: string[] = []
    const app = create(module('Root'), {
      transports: [
        fakeTransport({ kind: 'a', entry: 'as', log }, 'a'),
        fakeTransport({ kind: 'b', entry: 'bs', log, failSetup: true }, 'b'),
      ],
    })

    await expect(app.init()).rejects.toThrow('b setup failed')

    expect(log).toContain('a:stop')
    expect(log).toContain('b:stop')
    await expect(app.init()).rejects.toThrow('b setup failed')
    expect(log.filter((line) => line === 'a:create')).toHaveLength(1)
  })

  it('stays failed when a start throws', async () => {
    const log: string[] = []
    const app = create(module('Root'), {
      transports: [fakeTransport({ kind: 'a', entry: 'as', log, failStart: true })],
    })

    await expect(app.start()).rejects.toThrow('a start failed')
    await expect(app.start()).rejects.toThrow('a start failed')
    expect(log.filter((line) => line === 'a:start')).toHaveLength(1)
  })

  it('runs a module-level guard on every transport with its own kind', async () => {
    const kinds: string[] = []

    @Injectable()
    class KindGuard implements Guard {
      canActivate(ctx: ExecutionContext) {
        kinds.push(ctx.kind)
        return ctx.kind !== 'jobs'
      }
    }
    class Cmd {}
    class Job {}
    const Root = module('Root', { guards: [KindGuard], commands: [Cmd], jobs: [Job] })
    const log: string[] = []
    const app = create(Root, {
      transports: [
        fakeTransport({ kind: 'cli', entry: 'commands', log }, 'cli'),
        fakeTransport({ kind: 'jobs', entry: 'jobs', log }, 'jobs'),
      ],
    })
    await app.init()

    const allowed = [
      await app.transport(fakeTransport, 'cli').run(Cmd),
      await app.transport(fakeTransport, 'jobs').run(Job),
    ]

    expect(kinds).toEqual(['cli', 'jobs'])
    expect(allowed).toEqual([true, false])
  })

  it('runs an application-wide interceptor on every transport', async () => {
    const seen: string[] = []

    @Injectable()
    class Recorder {
      async intercept(ctx: ExecutionContext, next: () => Promise<unknown>) {
        seen.push(ctx.kind)
        return next()
      }
    }
    class Cmd {}
    const Root = module('Root', { commands: [Cmd] })
    const app = create(Root, {
      transports: [fakeTransport({ kind: 'cli', entry: 'commands', log: [] })],
    })
    app.intercept(Recorder)
    await app.init()

    await app.transport(fakeTransport).run(Cmd)

    expect(seen).toEqual(['cli'])
  })

  it('rejects two transports with one name', () => {
    const log: string[] = []

    expect(() =>
      createApplication(module('Root'), {
        transports: [
          fakeTransport({ kind: 'a', entry: 'as', log }, 'a'),
          fakeTransport({ kind: 'b', entry: 'bs', log }, 'a'),
        ],
      }),
    ).toThrow('[Navios] Two transports are named "a".')
  })

  it('refuses to hand out a transport before init', () => {
    const app = create(module('Root'), {
      transports: [fakeTransport({ kind: 'a', entry: 'as', log: [] })],
    })

    expect(() => app.transport(fakeTransport)).toThrow('call init() first')
  })

  it('throws for a transport the application does not have', async () => {
    const app = create(module('Root'))
    await app.init()

    expect(() => app.transport(fakeTransport)).toThrow('has no "fake" transport')
    expect(app.findTransport(fakeTransport)).toBeUndefined()
  })

  it('lets a plugin reach a transport and miss an absent one', async () => {
    const seen: { present?: FakeTransport; absent?: FakeTransport } = {}
    const plugin = definePlugin({
      name: 'probe',
      setup(api) {
        seen.present = api.transport(fakeTransport, 'a')
        seen.absent = api.transport(fakeTransport, 'missing')
      },
    })
    const app = create(module('Root'), {
      plugins: [plugin()],
      transports: [fakeTransport({ kind: 'a', entry: 'as', log: [] }, 'a')],
    })
    await app.init()

    expect(seen.present).toBe(app.transport(fakeTransport, 'a'))
    expect(seen.absent).toBeUndefined()
  })

  it('closes cleanly without ever being initialised', async () => {
    const app = createApplication(module('Root'), { logger: false })

    await expect(app.close()).resolves.toBeUndefined()
  })

  it('stops each transport once when a failed application is closed', async () => {
    const log: string[] = []
    const app = createApplication(module('Root'), {
      logger: false,
      transports: [
        fakeTransport({ kind: 'a', entry: 'as', log }, 'a'),
        fakeTransport({ kind: 'b', entry: 'bs', log, failSetup: true }, 'b'),
      ],
    })
    await expect(app.init()).rejects.toThrow('b setup failed')

    await app.close()

    expect(log.filter((line) => line === 'a:stop')).toHaveLength(1)
    expect(log.filter((line) => line === 'b:stop')).toHaveLength(1)
  })

  it('finishes an init in flight before it stops, and starts nothing afterwards', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = defineTransport({
      name: 'slow',
      async create() {
        await gate
        log.push('create')
        return {
          setup: () => void log.push('setup'),
          start: () => void log.push('start'),
          stop: () => void log.push('stop'),
        }
      },
    })
    const app = createApplication(module('Root'), { logger: false, transports: [slow()] })

    const starting = app.start()
    const closing = app.close()
    release()

    await expect(starting).rejects.toThrow('[Navios] The application is closed.')
    await closing
    expect(log).toEqual(['create', 'setup', 'stop'])
  })

  it('waits for a start in flight before it stops', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const inStart = new Promise<void>((resolve) => {
      entered = resolve
    })
    const slow = defineTransport({
      name: 'slow',
      create: () => ({
        setup() {},
        async start() {
          entered()
          await gate
          log.push('started')
        },
        stop: () => void log.push('stop'),
      }),
    })
    const app = createApplication(module('Root'), { logger: false, transports: [slow()] })
    await app.init()

    const starting = app.start()
    await inStart
    const closing = app.close()
    release()
    await starting
    await closing

    expect(log).toEqual(['started', 'stop'])
  })

  it('refuses to initialise or start after it was closed', async () => {
    const log: string[] = []
    const app = createApplication(module('Root'), {
      logger: false,
      transports: [fakeTransport({ kind: 'a', entry: 'as', log })],
    })
    await app.close()

    await expect(app.init()).rejects.toThrow('[Navios] The application is closed.')
    await expect(app.start()).rejects.toThrow('[Navios] The application is closed.')
    expect(log).toEqual([])
  })
})
