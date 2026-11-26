import { UnitTestContainer } from '@navios/di/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApplication } from '../application/application.mjs'
import {
  inject,
  Injectable,
  InjectionToken,
  Module,
  provide,
  registerInjectable,
} from '../index.mjs'
import { registerModule } from '../modules/module.mjs'
import { definePlugin } from '../plugins/plugin.mjs'
import { defineTransport } from '../transports/transport.mjs'

import type { ApplicationOptions } from '../application/application-options.mjs'
import type { Application } from '../application/application.mjs'
import type { Transport } from '../transports/transport.mjs'

import { settleWithin } from './settle-within.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const apps: Application[] = []

function create(root: new () => unknown, options: ApplicationOptions = {}) {
  const app = createApplication(root, { logger: false, ...options })
  apps.push(app)
  return app
}

function module(name: string, options: Record<string, unknown> = {}) {
  return registerModule({ [name]: class {} }[name], options as object)
}

function transport(hooks: Partial<Transport>) {
  return defineTransport({ name: 'test', create: () => ({ setup() {}, stop() {}, ...hooks }) })()
}

/** What a promise did within `ms`. */
function within(promise: Promise<unknown>, ms = 500): Promise<string> {
  return Promise.race([
    promise.then(
      () => 'resolved',
      (error: Error) => error.message,
    ),
    new Promise<string>((resolve) => setTimeout(resolve, ms, 'hung')),
  ])
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(async () => {
  vi.restoreAllMocks()
  // Bounded: a regression here leaves applications that cannot be closed.
  await settleWithin(apps.splice(0).map((app) => app.close()))
})

describe('hook order', () => {
  it('bootstraps dependencies before dependents and shuts them down after', async () => {
    const log: string[] = []

    @Injectable()
    class Db {
      onApplicationBootstrap() {
        log.push('bootstrap Db')
      }
      onApplicationShutdown() {
        log.push('shutdown Db')
      }
      onServiceDestroy() {
        log.push('destroy Db')
      }
    }
    @Injectable()
    class Repo {
      private readonly db = inject(Db)
      onApplicationBootstrap() {
        log.push(`bootstrap Repo${this.db ? '' : ' without Db'}`)
      }
      onApplicationShutdown() {
        log.push('shutdown Repo')
      }
      onServiceDestroy() {
        log.push('destroy Repo')
      }
    }
    @Module()
    class Root {
      private readonly repo = inject(Repo)
      onApplicationBootstrap() {
        log.push(`bootstrap Root${this.repo ? '' : ' without Repo'}`)
      }
      onApplicationShutdown() {
        log.push('shutdown Root')
      }
    }
    const app = create(Root)

    await app.init()
    await app.close()

    expect(log).toEqual([
      'bootstrap Db',
      'bootstrap Repo',
      'bootstrap Root',
      'shutdown Root',
      'shutdown Repo',
      'shutdown Db',
      'destroy Repo',
      'destroy Db',
    ])
  })

  it('calls the hooks of one object once, whatever it is known as', async () => {
    const log: string[] = []

    @Injectable()
    class Service {
      onApplicationBootstrap() {
        log.push('bootstrap')
      }
      onApplicationShutdown() {
        log.push('shutdown')
      }
    }
    const Alias = InjectionToken.create<Service>('Alias')
    const Product = InjectionToken.create<Service>('Product')
    @Module({
      providers: [
        provide(Alias, { existing: Service }),
        provide(Product, { factory: (ctx) => ctx.inject(Service) }),
      ],
    })
    class Root {
      private readonly all = [inject(Service), inject(Alias), inject(Product)]
      count() {
        return this.all.length
      }
    }
    const app = create(Root)

    await app.init()
    await app.close()

    expect(log).toEqual(['bootstrap', 'shutdown'])
  })

  it('leaves alone what the container did not build', async () => {
    const calls: string[] = []
    const strict = new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key === 'symbol' || key === 'then') {
            return undefined
          }
          throw new Error(`${key} is not declared`)
        },
      },
    )
    const remote = new Proxy(() => {}, {
      get(_target, key) {
        return typeof key === 'symbol' || key === 'then'
          ? undefined
          : () => void calls.push(String(key))
      },
    })
    const Env = InjectionToken.create<any>('Env')
    const Remote = InjectionToken.create<any>('Remote')
    @Module({
      providers: [provide(Env, { value: strict }), provide(Remote, { value: remote })],
    })
    class Root {
      private readonly given = [inject(Env), inject(Remote)]
      count() {
        return this.given.length
      }
    }
    const app = create(Root)

    await app.init()
    await app.close()

    expect(calls).toEqual([])
  })

  it('calls only hooks that an object or its class declares', async () => {
    const calls: string[] = []
    const strict = new Proxy(
      { PORT: 1 },
      {
        get(target, key) {
          if (typeof key === 'symbol' || key === 'then' || Object.hasOwn(target, key)) {
            return Reflect.get(target, key)
          }
          throw new Error(`${key} is not declared`)
        },
        getOwnPropertyDescriptor(target, key) {
          if (Object.hasOwn(target, key)) {
            return Reflect.getOwnPropertyDescriptor(target, key)
          }
          throw new Error(`${String(key)} is not declared`)
        },
      },
    )
    const remote = new Proxy(() => {}, {
      get(_target, key) {
        return typeof key === 'symbol' || key === 'then'
          ? undefined
          : () => {
              calls.push(String(key))
              throw new TypeError(`client[${String(key)}] is not a function`)
            }
      },
    })
    const Strict = InjectionToken.create<any>('Strict')
    const Remote = InjectionToken.create<any>('Remote')
    const Nothing = InjectionToken.create<any>('Nothing')
    const Plain = InjectionToken.create<any>('Plain')
    const Traced = InjectionToken.create<any>('Traced')
    class Service {
      onApplicationBootstrap() {
        calls.push('service bootstrap')
      }
      get onApplicationShutdown(): () => void {
        throw new Error('cannot be read')
      }
    }
    const error = vi.fn()
    @Module({
      providers: [
        provide(Strict, { factory: () => strict }),
        provide(Remote, { factory: () => remote }),
        provide(Nothing, { factory: () => Object.create(null) }),
        provide(Plain, { factory: () => ({ onApplicationShutdown: () => calls.push('plain') }) }),
        provide(Traced, { factory: () => new Proxy(new Service(), {}) }),
      ],
    })
    class Root {
      private readonly all = [Strict, Remote, Nothing, Plain, Traced].map((token) => inject(token))
      count() {
        return this.all.length
      }
    }
    const app = create(Root, { logger: { log() {}, warn() {}, error } })

    await app.init()
    await app.close()

    expect(calls).toEqual(['service bootstrap', 'plain'])
    expect(error.mock.calls.map(([message, reason]) => [message, reason.message])).toEqual([
      ['Error in shutdown step "onApplicationShutdown of Service"', 'cannot be read'],
    ])
  })

  it('runs on a UnitTestContainer that mocks what is not listed', async () => {
    @Injectable()
    class Dependency {}
    class Root {
      private readonly dependency = inject(Dependency)
      has() {
        return this.dependency !== undefined
      }
    }
    registerModule(Root)
    const container = new UnitTestContainer({
      providers: [{ token: Root, useClass: Root }],
      allowUnregistered: true,
    })
    const app = create(Root, { container })

    await expect(app.init()).resolves.toBe(app)
    await expect(app.close()).resolves.toBeUndefined()
  })
})

describe('re-entrant calls', () => {
  it.each(['onApplicationShutdown', 'onServiceDestroy'])('lets %s await close()', async (hook) => {
    let app!: Application
    const log: string[] = []
    class Service {}
    Object.assign(Service.prototype, {
      async [hook]() {
        await app.close()
        log.push('closed')
      },
    })
    registerInjectable(Service)
    app = create(module('Root'))
    await app.init()
    await app.get(Service)

    expect(await within(app.close())).toBe('resolved')
    expect(log).toEqual(['closed'])
  })

  it('lets a transport and a plugin await close() while they stop', async () => {
    let app!: Application
    const stopping = async () => {
      await app.close()
    }
    const plugin = definePlugin({
      name: 'closer',
      setup(api) {
        api.onShutdown(stopping)
      },
    })
    app = create(module('Root'), {
      transports: [transport({ stop: stopping })],
      plugins: [plugin()],
    })
    await app.init()

    expect(await within(app.close())).toBe('resolved')
  })

  it.each(['close', 'init', 'start'] as const)(
    'refuses to wait for %s() inside init()',
    async (call) => {
      let app!: Application
      const inPlugin = definePlugin({
        name: 'caller',
        async setup() {
          await app[call]()
        },
      })
      app = create(module('Root'), { plugins: [inPlugin()] })
      expect(await within(app.init())).toContain(`[Navios] ${call}() was called from inside init()`)

      class Root {
        async onModuleInit() {
          await app[call]()
        }
      }
      app = create(registerModule(Root))
      expect(await within(app.init())).toContain(`[Navios] ${call}() was called from inside init()`)

      class Service {
        async onApplicationBootstrap() {
          await app[call]()
        }
      }
      registerInjectable(Service)
      class WithService {
        readonly service = inject(Service)
      }
      app = create(registerModule(WithService))
      expect(await within(app.init())).toContain(`[Navios] ${call}() was called from inside init()`)
    },
  )

  it.each(['close', 'start'] as const)('refuses to wait for %s() inside start()', async (call) => {
    let app!: Application
    app = create(module('Root'), {
      transports: [
        transport({
          async start() {
            await app.init()
            await app[call]()
          },
        }),
      ],
    })

    expect(await within(app.start())).toContain(`[Navios] ${call}() was called from inside start()`)
  })

  it('closes once it is initialised when close() is called inside init() without waiting', async () => {
    const log: string[] = []
    let app!: Application
    class Root {
      onModuleInit() {
        void app.close()
        log.push('module init')
      }
      onApplicationBootstrap() {
        log.push('bootstrap')
      }
      onApplicationShutdown() {
        log.push('shutdown')
      }
    }
    registerModule(Root)
    app = create(Root)

    await app.init()
    await app.close()

    expect(log).toEqual(['module init', 'bootstrap', 'shutdown'])
  })

  it('starts once it is initialised when start() is called inside init() without waiting', async () => {
    const log: string[] = []
    let app!: Application
    class Root {
      onModuleInit() {
        void app.start()
        log.push('module init')
      }
      onApplicationBootstrap() {
        void app.start()
        log.push('bootstrap')
      }
    }
    registerModule(Root)
    app = create(Root, { transports: [transport({ start: () => void log.push('start') })] })

    await app.init()
    await vi.waitFor(() => expect(log).toContain('start'))

    expect(log).toEqual(['module init', 'bootstrap', 'start'])
  })

  it('reports why it could not start then, and drops that when init() fails', async () => {
    const error = vi.fn()
    let app!: Application
    class Root {
      onModuleInit() {
        void app.start()
      }
    }
    registerModule(Root)
    const logger = { log() {}, warn() {}, error }
    const failing = (hooks: Partial<Transport>) =>
      create(Root, { logger, transports: [transport(hooks)] })
    const fail = (message: string) => () => {
      throw new Error(message)
    }

    app = failing({ start: fail('EADDRINUSE') })
    await app.init()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    expect(error.mock.calls[0][0]).toBe('Error starting the application')
    expect(error.mock.calls[0][1].message).toBe('EADDRINUSE')

    error.mockClear()
    app = failing({ setup: fail('set-up failed') })
    await expect(app.init()).rejects.toThrow('set-up failed')
    await tick(5)
    expect(error).not.toHaveBeenCalled()
  })

  it('knows that a hook is over, whatever it left running', async () => {
    let app!: Application
    let close!: () => void
    let closing: Promise<void> | undefined
    const gate = new Promise<void>((resolve) => {
      close = resolve
    })
    const plugin = definePlugin({
      name: 'timer',
      setup() {
        // Runs in the async context of this plugin's set-up, after it.
        void gate.then(() => {
          closing = app.close()
        })
      },
    })
    class Root {
      async onModuleInit() {
        close()
        await tick(5)
      }
    }
    registerModule(Root)
    app = create(Root, { plugins: [plugin()] })

    await app.init()

    expect(await within(closing!)).toBe('resolved')
  })

  it('tells two applications apart', async () => {
    const other = create(module('Other'))
    class Root {
      async onModuleInit() {
        await other.init()
        await other.close()
      }
    }
    registerModule(Root)
    const app = create(Root)

    expect(await within(app.init())).toBe('resolved')
  })

  it('sees through the hooks of another application', async () => {
    let outer!: Application
    class Inner {
      async onModuleInit() {
        await outer.close()
      }
    }
    registerModule(Inner)
    const inner = create(Inner)
    class Root {
      async onModuleInit() {
        await inner.init()
      }
    }
    registerModule(Root)
    outer = create(Root)

    expect(await within(outer.init())).toContain('close() was called from inside init()')
  })
})

describe('a start-up that fails', () => {
  function background(log: string[]) {
    return definePlugin({
      name: 'background',
      setup(api) {
        api.onBootstrap(() => void log.push('started'))
        api.onShutdown(() => void log.push('stopped'))
      },
    })()
  }

  @Injectable()
  class Pool {
    static log: string[] = []
    onServiceDestroy() {
      Pool.log.push('pool closed')
    }
  }

  it('is torn down when init() fails, before init() rejects', async () => {
    const log: string[] = []
    Pool.log = log
    class Root {
      readonly pool = inject(Pool)
      onApplicationBootstrap() {
        throw new Error('cannot warm up')
      }
      onApplicationShutdown() {
        log.push('root shutdown')
      }
    }
    registerModule(Root)
    const stop = vi.fn(() => void log.push('transport stopped'))
    const app = create(Root, { plugins: [background(log)], transports: [transport({ stop })] })

    await expect(app.init()).rejects.toThrow('cannot warm up')

    expect(log).toEqual(['started', 'transport stopped', 'root shutdown', 'stopped', 'pool closed'])
    expect(stop).toHaveBeenCalledWith(0)
    await app.close()
    expect(log).toHaveLength(5)
    await expect(app.init()).rejects.toThrow('cannot warm up')
    await expect(app.start()).rejects.toThrow('cannot warm up')
  })

  it('is torn down when a transport fails to start', async () => {
    const log: string[] = []
    Pool.log = log
    class Root {
      readonly pool = inject(Pool)
    }
    registerModule(Root)
    const app = create(Root, {
      plugins: [background(log)],
      transports: [
        transport({
          start() {
            throw new Error('EADDRINUSE')
          },
        }),
      ],
    })

    await expect(app.start()).rejects.toThrow('EADDRINUSE')

    expect(log).toEqual(['started', 'stopped', 'pool closed'])
    await expect(app.start()).rejects.toThrow('EADDRINUSE')
    await app.close()
    expect(log).toHaveLength(3)
  })

  it('reports what fails in that teardown and rejects with the first error', async () => {
    const error = vi.fn()
    const logger = { log() {}, warn() {}, error }
    const failure = new Error('stop failed')
    const app = create(module('Root'), {
      logger,
      transports: [
        transport({
          start() {
            throw new Error('start failed')
          },
          stop() {
            throw failure
          },
        }),
      ],
    })

    await expect(app.start()).rejects.toThrow('start failed')

    expect(error.mock.calls.flat()).toContain(failure)
  })

  it('is torn down when a plugin or a transport cannot be created', async () => {
    const stop = vi.fn()
    const failing = defineTransport({
      name: 'failing',
      create(): Transport {
        throw new Error('create failed')
      },
    })
    const app = create(module('Root'), { transports: [transport({ stop }), failing()] })

    await expect(app.start()).rejects.toThrow('create failed')

    expect(stop).toHaveBeenCalledTimes(1)
  })
})

describe('closing while starting', () => {
  it('lets the shutdown finish before start() rejects', async () => {
    const log: string[] = []

    @Injectable()
    class Pool {
      async onServiceDestroy() {
        await tick(10)
        log.push('pool closed')
      }
    }
    class Root {
      readonly pool = inject(Pool)
      async onModuleInit() {
        await tick(5)
      }
    }
    registerModule(Root)
    const app = create(Root)

    const starting = app.start().catch((error: Error) => log.push(error.message))
    void app.close()
    await starting

    expect(log).toEqual(['pool closed', '[Navios] The application is closed.'])
  })
})

describe('shutdownTimeout', () => {
  const never = () => new Promise<never>(() => {})

  function bounded(root: new () => unknown, options: ApplicationOptions = {}) {
    const error = vi.fn()
    const logger = { log() {}, warn() {}, error }
    const app = create(root, { shutdownTimeout: 20, logger, ...options })
    const reported = () => error.mock.calls.map((call) => String(call[0]))
    return { app, reported }
  }

  it('bounds a hook, and goes on with the next one', async () => {
    const log: string[] = []

    @Injectable()
    class Good {
      onApplicationShutdown() {
        log.push('good')
      }
      onServiceDestroy() {
        log.push('destroyed')
      }
    }
    class Root {
      readonly good = inject(Good)
      onApplicationShutdown() {
        return never()
      }
    }
    registerModule(Root)
    const { app, reported } = bounded(Root)
    await app.init()

    expect(await within(app.close())).toBe('resolved')

    expect(log).toEqual(['good', 'destroyed'])
    expect(reported()).toContain(
      'Shutdown step "onApplicationShutdown of Root" did not finish within 20 ms',
    )
  })

  it('bounds the disposal of the container', async () => {
    @Injectable()
    class Stuck {
      onServiceDestroy() {
        return never()
      }
    }
    class Root {
      readonly stuck = inject(Stuck)
    }
    registerModule(Root)
    const { app, reported } = bounded(Root)
    await app.init()

    expect(await within(app.close())).toBe('resolved')
    expect(reported()).toContain(
      'Shutdown step "disposal of the container" did not finish within 20 ms',
    )
  })

  it('bounds a transport that does not keep the time it was given', async () => {
    vi.useFakeTimers()
    try {
      const { app, reported } = bounded(module('Root'), {
        transports: [transport({ stop: never })],
      })
      await app.init()

      const closing = app.close()
      await vi.advanceTimersByTimeAsync(10_000)

      await closing
      expect(reported()[0]).toMatch(/^Shutdown step "stop of transport test" did not finish within/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds the wait for an init() that hangs, after which nothing is built', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = defineTransport({
      name: 'slow',
      async create() {
        await gate
        return {
          setup: () => void log.push('setup'),
          stop: (timeoutMs) => void log.push(`stop ${timeoutMs}`),
        }
      },
    })
    const { app, reported } = bounded(module('Root'), { transports: [slow()] })

    const init = app.init()
    expect(await within(app.close())).toBe('resolved')
    expect(reported()).toContain('Shutdown step "init()" did not finish within 20 ms')

    release()
    await expect(init).rejects.toThrow('[Navios] The application is closed.')
    expect(log).toEqual(['stop 0'])
  })

  it('bounds the wait for a start() that hangs, and starts nothing more', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = defineTransport({
      name: 'slow',
      create: () => ({
        setup() {},
        async start() {
          await gate
          log.push('started')
        },
        stop: (timeoutMs) => void log.push(`stop ${timeoutMs}`),
      }),
    })
    const { app } = bounded(module('Root'), {
      transports: [slow(), transport({ start: () => void log.push('start') })],
    })
    await app.init()

    const starting = app.start()
    await tick()
    expect(await within(app.close())).toBe('resolved')
    expect(log).toEqual(['stop 20'])
    release()

    await expect(starting).rejects.toThrow('[Navios] The application is closed.')
    expect(log).toEqual(['stop 20', 'started', 'stop 0'])
  })

  it('stops a transport again whose start() fails only after it was stopped', async () => {
    const stop = vi.fn()
    let fail!: (error: Error) => void
    const gate = new Promise<void>((_resolve, reject) => {
      fail = reject
    })
    const { app } = bounded(module('Root'), {
      transports: [transport({ start: () => gate, stop })],
    })
    await app.init()

    const starting = app.start()
    await tick()
    await app.close()
    fail(new Error('EADDRINUSE'))

    await expect(starting).rejects.toThrow('EADDRINUSE')
    expect(stop.mock.calls).toEqual([[20], [0]])
  })

  it.each([Infinity, 2 ** 31, 2 ** 40])(
    'gives a transport no more than a timer can wait, for %d',
    async (shutdownTimeout) => {
      const stop = vi.fn()
      const app = create(module('Root'), { shutdownTimeout, transports: [transport({ stop })] })
      await app.init()

      await app.close()

      const [timeoutMs] = stop.mock.calls[0]
      expect(timeoutMs).toBeLessThan(2 ** 31)
      expect(timeoutMs).toBeGreaterThan(2 ** 30)
    },
  )

  it('may be infinite', async () => {
    const app = create(module('Root'), { shutdownTimeout: Infinity })
    class Slow {
      async onApplicationShutdown() {
        await tick(20)
        Slow.finished = true
      }
      static finished = false
    }
    registerInjectable(Slow)
    await app.init()
    await app.get(Slow)

    await app.close()

    expect(Slow.finished).toBe(true)
  })
})

describe('errors nobody receives', () => {
  it('go to the logger when a destroy hook throws, at the root and in a scope', async () => {
    const error = vi.fn()
    const failure = new Error('pool.end failed')

    @Injectable()
    class Pool {
      onServiceDestroy() {
        throw failure
      }
    }
    const app = create(module('Root'), { logger: { log() {}, warn() {}, error } })
    await app.init()
    await app.get(Pool)

    await app.close()

    expect(error.mock.calls.flat()).toContain(failure)
  })

  it('go to the console when the logger fails as well, and stop nothing', async () => {
    const log: string[] = []
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('hook failed')

    @Injectable()
    class After {
      onApplicationShutdown() {
        log.push('after')
      }
      onServiceDestroy() {
        log.push('destroyed')
      }
    }
    class Root {
      readonly after = inject(After)
      onApplicationShutdown() {
        throw failure
      }
    }
    registerModule(Root)
    const app = create(Root, {
      logger: {
        log() {},
        warn() {},
        error() {
          throw new Error('log transport closed')
        },
      },
    })
    await app.init()

    await expect(app.close()).resolves.toBeUndefined()

    expect(log).toEqual(['after', 'destroyed'])
    expect(printed.mock.calls.flat()).toContain(failure)
  })

  it('go to the console when there is no logger yet, and nowhere with logger: false', async () => {
    const printed = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const failure = new Error('stop failed')
    const fails = (): Transport => ({
      setup() {},
      stop() {
        throw failure
      },
    })
    const first = defineTransport({ name: 'first', create: fails })
    const second = defineTransport({
      name: 'second',
      create(): Transport {
        throw new Error('create failed')
      },
    })
    const transports = () => [first(), second()]
    class Broken {
      log() {}
      warn() {}
      error() {}
    }
    const LoggerFails = { factory: () => Promise.reject<Broken>(new Error('no logger')) }
    const { LoggerOutput } = await import('../index.mjs')

    const silent = create(module('Root'), { transports: transports() })
    await expect(silent.init()).rejects.toThrow('create failed')
    expect(printed).not.toHaveBeenCalled()

    const loud = createApplication(module('Root'), {
      transports: transports(),
      providers: [provide(LoggerOutput, LoggerFails)],
    })
    await expect(loud.init()).rejects.toThrow('create failed')
    expect(printed.mock.calls.flat().join('')).toContain('stop failed')
  })
})
