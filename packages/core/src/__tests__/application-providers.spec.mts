import { TestContainer } from '@navios/di/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApplication } from '../application/application.mjs'
import {
  ConsoleLogger,
  Container,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  Logger,
  LoggerOutput,
  provide,
  registerInjectable,
} from '../index.mjs'
import { registerModule } from '../modules/module.mjs'
import { definePlugin } from '../plugins/plugin.mjs'
import { defineTransport } from '../transports/transport.mjs'

import type { ApplicationOptions } from '../application/application-options.mjs'
import type { Application } from '../application/application.mjs'
import type { LoggerService, PluginApi } from '../index.mjs'

import { settleWithin } from './settle-within.mjs'

const apps: Application[] = []

function create(root: new () => unknown, options: ApplicationOptions = {}) {
  const app = createApplication(root, { logger: false, ...options })
  apps.push(app)
  return app
}

function module(name: string, options: Record<string, unknown> = {}) {
  return registerModule({ [name]: class {} }[name], options as object)
}

function plugin(setup: (api: PluginApi) => void | Promise<void>, name = 'test') {
  return definePlugin({ name, setup })()
}

/** A token with a default, and what provides it otherwise. */
function token(name = 'Token') {
  const Token = InjectionToken.create<{ from: string }>(name)
  class Default {
    from = 'default'
  }
  registerInjectable(Default, { token: Token })
  return { Token, from: (from: string) => provide(Token, { value: { from } }) }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await settleWithin(apps.splice(0).map((app) => app.close()))
})

describe('which provider wins', () => {
  it('the application over a plugin, a plugin over a module, a module over the default', async () => {
    const all = token()
    const pluginAndModule = token()
    const moduleOnly = token()
    const none = token()
    const Root = module('Root', {
      providers: [all.from('module'), pluginAndModule.from('module'), moduleOnly.from('module')],
    })
    const app = create(Root, {
      providers: [all.from('application')],
      plugins: [
        plugin((api) => {
          api.provide(all.Token, { value: { from: 'plugin' } })
          api.provide(pluginAndModule.Token, { value: { from: 'plugin' } })
        }),
      ],
    })
    await app.init()

    expect((await app.get(all.Token)).from).toBe('application')
    expect((await app.get(pluginAndModule.Token)).from).toBe('plugin')
    expect((await app.get(moduleOnly.Token)).from).toBe('module')
    expect((await app.get(none.Token)).from).toBe('default')
  })

  it('what the caller put into the container, over plugins and modules', async () => {
    const bound = token('Bound')
    const added = token('Added')
    const given = token('Given')
    const container = new TestContainer()
    container.bind(bound.Token).toValue({ from: 'container' })
    container.addInstance(added.Token, { from: 'container' })
    container.provide(given.Token, { value: { from: 'container' } })
    const tokens = [bound, added, given]
    const app = create(module('Root', { providers: tokens.map(({ from }) => from('module')) }), {
      container,
      plugins: [
        plugin((api) => {
          for (const { Token } of tokens) {
            api.provide(Token, { value: { from: 'plugin' } })
          }
        }),
      ],
    })
    await app.init()

    for (const { Token } of tokens) {
      expect((await app.get(Token)).from).toBe('container')
    }
  })

  it('what is in the container, over what the application lists and its logger', async () => {
    const debug = vi.fn()
    const bound = token('Bound')
    const bindClass = token('BindClass')
    const free = token('Free')
    class Mock {
      from = 'container'
    }
    const container = new TestContainer()
    container.bind(bound.Token).toValue({ from: 'container' })
    container.bind(bindClass.Token).toClass(Mock)
    container.bind(LoggerOutput).toValue({ log() {}, warn() {}, error() {}, debug })
    const app = create(module('Root'), {
      container,
      logger: { log() {}, warn() {}, error() {} },
      providers: [
        bound.from('application'),
        bindClass.from('application'),
        free.from('first'),
        free.from('application'),
      ],
    })
    await app.init()

    expect((await app.get(bound.Token)).from).toBe('container')
    expect((await app.get(bindClass.Token)).from).toBe('container')
    expect((await app.get(free.Token)).from).toBe('application')
    expect(debug.mock.calls.map((call) => call[0])).toEqual([
      'The container provides Bound, so the one of the `providers` option is not used.',
      'The container provides BindClass, so the one of the `providers` option is not used.',
      'The container provides LoggerOutput, so the one of the `logger` option is not used.',
    ])
  })

  it('says so when the provider of a plugin is not used', async () => {
    const debug = vi.fn()
    const { Token, from } = token('Clock')
    const app = create(module('Root'), {
      logger: { log() {}, warn() {}, error() {}, debug },
      providers: [from('application')],
      plugins: [plugin((api) => api.provide(Token, { value: { from: 'plugin' } }), 'clock')],
    })

    await app.init()

    expect(debug.mock.calls.map((call) => call[0])).toContain(
      'Plugin clock provides Clock, but the application provides its own.',
    )
  })

  it('the importing module over the imported one, whatever else imports it', async () => {
    const { Token, from } = token()
    const Leaf = module('Leaf', { providers: [from('leaf')] })
    const Middle = module('Middle', { imports: [Leaf], providers: [from('middle')] })
    const Root = module('Root', { imports: [Leaf, Middle], providers: [from('root')] })
    const app = create(Root)
    await app.init()

    expect((await app.get(Token)).from).toBe('root')
  })

  it('the last one in a list', async () => {
    const inModule = token()
    const inOptions = token()
    const app = create(
      module('Root', { providers: [inModule.from('first'), inModule.from('second')] }),
      { providers: [inOptions.from('first'), inOptions.from('second')] },
    )
    await app.init()

    expect((await app.get(inModule.Token)).from).toBe('second')
    expect((await app.get(inOptions.Token)).from).toBe('second')
  })

  it('refuses two modules that do not import each other', async () => {
    const { Token, from } = token('Mailer')
    const A = module('A', { providers: [from('a')] })
    const B = module('B', { providers: [from('b')] })
    const decided = module('Decided', { imports: [A, B], providers: [from('root')] })

    await expect(create(module('Root', { imports: [A, B] })).init()).rejects.toThrow(
      '[Navios] Modules A and B both provide Mailer, and neither imports the other.',
    )
    const app = create(decided)
    await app.init()
    expect((await app.get(Token)).from).toBe('root')
  })

  it.each(['providers', 'container', 'plugin'])(
    'does not mind two modules when the %s decides',
    async (source) => {
      const { Token, from } = token('Mailer')
      const A = module('A', { providers: [from('a')] })
      const B = module('B', { providers: [from('b')] })
      const container = new TestContainer()
      if (source === 'container') {
        container.bind(Token).toValue({ from: source })
      }
      const app = create(module('Root', { imports: [A, B] }), {
        container,
        providers: source === 'providers' ? [from(source)] : [],
        plugins:
          source === 'plugin'
            ? [plugin((api) => api.provide(Token, { value: { from: source } }))]
            : [],
      })
      await app.init()

      expect((await app.get(Token)).from).toBe(source)
    },
  )

  it('names the two modules when their token is needed before a plugin could decide', async () => {
    const { Token, from } = token('Mailer')
    const A = module('A', { providers: [from('a')] })
    const B = module('B', { providers: [from('b')] })
    const reader = plugin(async (api) => void (await api.container.get(Token)))

    await expect(
      create(module('Root', { imports: [A, B] }), { plugins: [reader] }).init(),
    ).rejects.toThrow('Modules A and B both provide Mailer')
  })

  it('takes equal providers of two modules for one', async () => {
    const value = token('Value')
    const primitive = InjectionToken.create<string>('Primitive')
    const byClass = token('Class')
    const byFactory = token('Factory')
    const alias = token('Alias')
    class Impl {
      from = 'class'
    }
    @Injectable()
    class Aliased {
      from = 'alias'
    }
    const object = { from: 'value' }
    const factory = () => ({ from: 'factory' })
    const providers = () => [
      provide(value.Token, { value: object }),
      provide(primitive, { value: 'text' }),
      provide(byClass.Token, Impl),
      provide(byFactory.Token, { factory }),
      provide(alias.Token, { existing: Aliased }),
    ]
    const A = module('A', { providers: providers() })
    const B = module('B', { providers: providers() })
    const app = create(module('Root', { imports: [A, B] }))
    await app.init()

    expect((await app.get(value.Token)).from).toBe('value')
    expect(await app.get(primitive)).toBe('text')
    expect((await app.get(byClass.Token)).from).toBe('class')
    expect((await app.get(byFactory.Token)).from).toBe('factory')
    expect((await app.get(alias.Token)).from).toBe('alias')
  })

  it('tells providers apart that differ in anything', async () => {
    class Impl {
      from = 'class'
    }
    class Other {
      from = 'other'
    }
    const { Token } = token('Mailer')
    const pairs = [
      [provide(Token, Impl), provide(Token, Other)],
      [provide(Token, Impl), provide(Token, { class: Impl, scope: InjectableScope.Transient })],
      [provide(Token, { value: { from: 'x' } }), provide(Token, { value: { from: 'x' } })],
      [
        provide(Token, { factory: () => ({ from: 'x' }) }),
        provide(Token, { factory: () => ({ from: 'x' }) }),
      ],
      [provide(Token, Impl), provide(Token, { existing: Impl })],
    ]
    for (const [one, other] of pairs) {
      const A = module('A', { providers: [one] })
      const B = module('B', { providers: [other] })
      await expect(create(module('Root', { imports: [A, B] })).init()).rejects.toThrow(
        'Modules A and B both provide Mailer',
      )
    }
  })

  it('takes what overrides everything else, also next to an equal one', async () => {
    const { Token, from } = token('Mailer')
    const shared = from('shared')
    const Defaults = module('Defaults', { providers: [from('default')] })
    const A = module('A', { imports: [Defaults], providers: [shared] })
    const B = module('B', { providers: [shared] })
    for (const imports of [
      [A, B],
      [B, A],
    ]) {
      const app = create(module('Root', { imports }))
      await app.init()
      expect((await app.get(Token)).from).toBe('shared')
    }
  })

  it('an application module over the ones that plugins add', async () => {
    const { Token, from } = token('Mailer')
    const Extra = module('Extra', { providers: [from('extra')] })
    const adder = (...modules: Array<ReturnType<typeof module>>) =>
      plugin((api) => modules.forEach((added) => api.addModule(added)))

    const own = create(module('Root', { providers: [from('root')] }), { plugins: [adder(Extra)] })
    await own.init()
    expect((await own.get(Token)).from).toBe('root')

    const Feature = module('Feature', { providers: [from('feature')] })
    const imported = create(module('Root', { imports: [Feature] }), {
      plugins: [adder(module('Wide', { imports: [Feature], providers: [from('wide')] }))],
    })
    await imported.init()
    expect((await imported.get(Token)).from).toBe('feature')

    const alone = create(module('Root'), { plugins: [adder(Extra)] })
    await alone.init()
    expect((await alone.get(Token)).from).toBe('extra')

    const Another = module('Another', { providers: [from('another')] })
    await expect(
      create(module('Root'), { plugins: [adder(Extra, Another)] }).init(),
    ).rejects.toThrow('Modules Extra and Another both provide Mailer')

    const over = plugin((api) => {
      api.addModule(Extra)
      api.provide(Token, { value: { from: 'plugin' } })
    })
    const app = create(module('Root'), { plugins: [over] })
    await app.init()
    expect((await app.get(Token)).from).toBe('plugin')
  })
})

describe('what is not a provider', () => {
  it('is refused among those of the application', () => {
    @Injectable()
    class UsersService {}

    expect(() => createApplication(module('Root'), { providers: [UsersService as never] })).toThrow(
      '[Navios] The application lists UsersService in providers',
    )
  })
})

describe('a provider that comes too late', () => {
  it('is refused when a module lists it', async () => {
    const { Token, from } = token('Early')
    const Root = () => module('Root', { providers: [from('module')] })
    const message = '[Navios] Root provides Early, which has already been resolved.'

    const beforeInit = create(Root())
    await beforeInit.get(Token)
    await expect(beforeInit.init()).rejects.toThrow(message)

    const warm = new Container()
    await warm.get(Token)
    await expect(create(Root(), { container: warm }).init()).rejects.toThrow(message)
  })

  it('is refused when a module that a plugin adds lists it', async () => {
    const { Token, from } = token('Early')
    const Extra = module('Extra', { providers: [from('extra')] })
    const reader = defineTransport({
      name: 'reader',
      async create(host) {
        await host.container.get(Token)
        return { setup() {}, stop() {} }
      },
    })

    await expect(
      create(module('Root'), {
        transports: [reader()],
        plugins: [plugin((api) => api.addModule(Extra))],
      }).init(),
    ).rejects.toThrow('[Navios] Extra provides Early, which has already been resolved.')
  })

  it('is refused when the application lists it', async () => {
    const { Token, from } = token('Early')
    const container = new Container()
    await container.get(Token)

    expect(() =>
      createApplication(module('Root'), { container, providers: [from('application')] }),
    ).toThrow('[Navios] `providers` has Early, which has already been resolved in `container`.')
    await container.get(LoggerOutput)
    expect(() => createApplication(module('Root'), { container, logger: false })).toThrow(
      '[Navios] `logger` has LoggerOutput, which has already been resolved in `container`.',
    )
    await container.dispose()
  })
})

describe('the container of an application', () => {
  it('backs one application at a time', async () => {
    const container = new Container()
    const first = create(module('First'), { container })

    expect(() => createApplication(module('Second'), { container })).toThrow(
      '[Navios] This container already backs an open application.',
    )
    await first.close()
    expect(() => createApplication(module('Third'), { container })).not.toThrow()
  })
})

describe('what comes after its time', () => {
  it('usePlugin() and intercept() once init() has been called', async () => {
    @Injectable()
    class Around {
      intercept(_ctx: unknown, next: () => Promise<unknown>) {
        return next()
      }
    }
    const errors: string[] = []
    const attempt = (call: () => unknown) => {
      try {
        call()
      } catch (error) {
        errors.push((error as Error).message)
      }
    }
    let app!: Application
    const late = plugin(() => {}, 'late')
    const outer = plugin(() => {
      attempt(() => app.usePlugin(late))
      attempt(() => app.intercept(Around))
    })
    app = create(module('Root'), { plugins: [outer] })

    const init = app.init()
    attempt(() => app.usePlugin(late))
    await init

    expect(errors).toEqual([
      '[Navios] usePlugin() must be called before init()',
      '[Navios] usePlugin() must be called before init()',
      '[Navios] intercept() must be called before init()',
    ])
  })

  it('the plugin API once the plugins are set up', async () => {
    let api!: PluginApi
    const inBootstrap: string[] = []
    const call = (name: string, fn: () => unknown) => {
      try {
        fn()
        inBootstrap.push(`${name} accepted`)
      } catch (error) {
        inBootstrap.push((error as Error).message)
      }
    }
    class Around {
      intercept(_ctx: unknown, next: () => Promise<unknown>) {
        return next()
      }
    }
    const { Token } = token()
    const app = create(module('Root'), {
      plugins: [
        plugin((given) => {
          api = given
          api.onBootstrap(() => {
            call('addModule', () => api.addModule(module('Extra')))
            call('intercept', () => api.intercept(Around))
            call('provide', () => api.provide(Token, { value: { from: 'late' } }))
            call('decorate', () => api.decorate(Token, (value) => value))
            call('onBootstrap', () => api.onBootstrap(() => {}))
            call('onShutdown', () => api.onShutdown(() => {}))
          })
        }),
      ],
    })

    await app.init()

    expect(inBootstrap).toEqual(
      ['addModule', 'intercept', 'provide', 'decorate', 'onBootstrap', 'onShutdown'].map(
        (name) => `[Navios] api.${name}() must be called during setup`,
      ),
    )
  })
})

describe('the logger', () => {
  function recorder() {
    const lines: string[] = []
    const add = (message: unknown) => void lines.push(String(message))
    const output: LoggerService = { log: add, warn: add, error: add, debug: add, verbose: add }
    return { lines, output }
  }

  it.each(['plugin', 'module of a plugin'])('can come from a %s', async (source) => {
    const printed = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const { lines, output } = recorder()
    let hostLogger!: LoggerService
    const early = defineTransport({
      name: 'early',
      create(host) {
        hostLogger = host.logger
        return { setup: () => host.logger.log('transport'), stop() {} }
      },
    })

    @Injectable()
    class Service {
      readonly logger = inject(Logger, { context: 'Service' })
    }
    let service!: Service
    const app = create(module('Root'), {
      logger: undefined,
      transports: [early()],
      plugins: [
        plugin(async (api) => {
          service = await api.container.get(Service)
          if (source === 'plugin') {
            api.provide(LoggerOutput, { value: output })
          } else {
            api.addModule(
              module('Logging', { providers: [provide(LoggerOutput, { value: output })] }),
            )
          }
        }),
      ],
    })

    await app.init()
    service.logger.log('service')
    hostLogger.warn('host')
    await app.get(Logger).then((logger) => logger.log('later'))

    expect(lines).toEqual(['Setting up plugin test', 'transport', 'service', 'host', 'later'])
    expect(printed).not.toHaveBeenCalled()
  })

  it('names the plugins that were set up when one of them fails', async () => {
    const { lines, output } = recorder()
    const app = create(module('Root'), {
      logger: output,
      plugins: [
        plugin(() => {
          throw new Error('set-up failed')
        }, 'broken'),
      ],
    })

    await expect(app.init()).rejects.toThrow('set-up failed')

    expect(lines).toEqual(['Setting up plugin broken'])
  })

  it.each(['before', 'after'])(
    'can come from a plugin %s one that logs while it is set up',
    async (place) => {
      const { lines, output } = recorder()
      const talkative = plugin(async (api) => {
        const logger = await api.container.get(Logger, { context: 'Talkative' })
        logger.log('one')
        logger.warn('two')
      }, 'talkative')
      const provider = plugin((api) => api.provide(LoggerOutput, { value: output }), 'provider')
      const plugins = place === 'before' ? [provider, talkative] : [talkative, provider]
      const app = create(module('Root'), { logger: undefined, plugins })

      await app.init()

      expect(lines.filter((line) => !line.startsWith('Setting up'))).toEqual(['one', 'two'])
    },
  )

  it('keeps what is logged early in order until it is settled', async () => {
    const { lines, output } = recorder()
    const early = defineTransport({
      name: 'early',
      create(host) {
        host.logger.log('transport created')
        expect(lines).toEqual([])
        return { setup: () => host.logger.log('transport set up'), stop() {} }
      },
    })
    const app = create(module('Root', { providers: [provide(LoggerOutput, { value: output })] }), {
      logger: undefined,
      transports: [early()],
      plugins: [
        plugin(async (api) => {
          ;(await api.container.get(Logger)).log('plugin')
        }),
      ],
    })

    await app.init()

    expect(lines).toEqual([
      'transport created',
      'Setting up plugin test',
      'plugin',
      'transport set up',
    ])
  })

  it('applies its levels to what was logged before it was settled', async () => {
    const printed: string[] = []
    const record = (text: unknown) => {
      printed.push(String(text))
      return true
    }
    vi.spyOn(process.stdout, 'write').mockImplementation(record)
    vi.spyOn(process.stderr, 'write').mockImplementation(record)
    const talkative = (fails: boolean) =>
      plugin(async (api) => {
        const logger = await api.container.get(Logger)
        logger.log('hidden')
        logger.error('shown')
        if (fails) {
          throw new Error('set-up failed')
        }
      })

    for (const fails of [false, true]) {
      printed.length = 0
      const app = create(module('Root'), { logger: ['error'], plugins: [talkative(fails)] })
      await app.init().catch(() => {})

      expect(printed).toHaveLength(1)
      expect(printed[0]).toContain('shown')
    }
  })

  it('prints what was logged early when its output cannot be had', async () => {
    const printed: string[] = []
    const record = (text: unknown) => {
      printed.push(String(text))
      return true
    }
    vi.spyOn(process.stdout, 'write').mockImplementation(record)
    vi.spyOn(process.stderr, 'write').mockImplementation(record)
    for (const factory of [
      () => new Promise<LoggerService>(() => {}),
      () => {
        throw new Error('no logger')
      },
    ]) {
      printed.length = 0
      const app = create(module('Root'), {
        logger: undefined,
        shutdownTimeout: 20,
        providers: [provide(LoggerOutput, { factory })],
        plugins: [
          plugin(async (api) => {
            ;(await api.container.get(Logger)).warn('cannot connect')
            throw new Error('set-up failed')
          }, 'broken'),
        ],
      })

      await expect(app.init()).rejects.toThrow('set-up failed')

      expect(printed[0]).toContain('Setting up plugin broken')
      expect(printed[1]).toContain('cannot connect')
    }
  })

  it('prints what was logged early when the set-up is given up, or the process ends', async () => {
    const { lines, output } = recorder()
    const hanging = plugin(async (api) => {
      ;(await api.container.get(Logger)).log('connecting')
      await new Promise(() => {})
    })
    const app = create(module('Root'), {
      logger: output,
      plugins: [hanging],
      shutdownTimeout: 10,
    })
    void app.init().catch(() => {})
    await vi.waitFor(() => expect(process.listenerCount('exit')).toBeGreaterThan(0))
    await app.close()
    expect(lines).toContain('connecting')

    const listeners = process.listeners('exit')
    const second = recorder()
    const ended = create(module('Root'), {
      logger: second.output,
      plugins: [hanging],
      shutdownTimeout: 10,
    })
    void ended.init().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(second.lines).toEqual([])
    const [onExit] = process.listeners('exit').filter((listener) => !listeners.includes(listener))
    onExit(1)
    expect(second.lines).toContain('connecting')
  })

  it('may fail to write what was logged early', async () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = () => {
      throw new Error('log transport closed')
    }
    const app = create(module('Root'), {
      logger: { log: fail, warn: fail, error: fail },
      plugins: [
        plugin(async (api) => {
          ;(await api.container.get(Logger)).warn('slow')
        }),
      ],
    })

    await expect(app.init()).resolves.toBe(app)
    expect(printed.mock.calls.flat()).toContain('slow')
  })

  it('delivers what was logged early to an output that is built asynchronously', async () => {
    const { lines, output } = recorder()
    const early = defineTransport({
      name: 'early',
      create(host) {
        host.logger.log('one')
        host.logger.log('two')
        return { setup() {}, stop() {} }
      },
    })
    const app = create(module('Root'), {
      logger: undefined,
      providers: [
        provide(LoggerOutput, {
          factory: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            return output
          },
        }),
      ],
      transports: [early()],
    })

    await app.init()

    expect(lines).toEqual(['one', 'two'])
  })

  it('takes its levels from `logger`, also when a module provides it', async () => {
    const printed: string[] = []
    const record = (text: unknown) => {
      printed.push(String(text))
      return true
    }
    vi.spyOn(process.stdout, 'write').mockImplementation(record)
    vi.spyOn(process.stderr, 'write').mockImplementation(record)
    class Custom extends ConsoleLogger {}
    const value = new ConsoleLogger({ prefix: 'given' })

    for (const provider of [
      provide(LoggerOutput, Custom),
      provide(LoggerOutput, { value }),
      undefined,
    ]) {
      printed.length = 0
      const app = create(module('Root', { providers: provider ? [provider] : [] }), {
        logger: ['error'],
      })
      await app.init()
      const logger = await app.get(Logger)
      logger.log('hidden')
      logger.error('shown')

      expect(printed).toHaveLength(1)
      expect(printed[0]).toContain('shown')
    }
    expect(printed[0]).not.toContain('given')
  })

  it('prints request ids when there is an async context, unless told not to', async () => {
    const asked = new ConsoleLogger({ requestId: false })
    const open = new ConsoleLogger()
    const setUp = (logger: ConsoleLogger) =>
      (logger as unknown as { options: { requestId?: boolean } }).options.requestId

    await create(module('Root'), { logger: asked, asyncContext: true }).init()
    await create(module('Root'), { logger: open, asyncContext: true }).init()

    expect(setUp(asked)).toBe(false)
    expect(setUp(open)).toBe(true)
  })

  it('works when it is a ConsoleLogger without options', async () => {
    const printed = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const app = create(module('Root'), { logger: new ConsoleLogger() })
    await app.init()

    ;(await app.get(Logger)).error('broken')

    expect(printed.mock.calls.flat().join('')).toContain('broken')
  })
})
