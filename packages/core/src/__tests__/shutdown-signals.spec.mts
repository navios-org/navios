import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApplication } from '../application/application.mjs'
import { registerModule } from '../modules/module.mjs'
import { defineTransport } from '../transports/transport.mjs'

import type { Application } from '../application/application.mjs'

import { settleWithin } from './settle-within.mjs'

const SIGNAL = 'SIGUSR2'
const apps: Application[] = []

function create(stop: () => void | Promise<void> = () => {}) {
  const transport = defineTransport({ name: 'test', create: () => ({ setup() {}, stop }) })
  class Root {}
  const app = createApplication(registerModule(Root), { logger: false, transports: [transport()] })
  apps.push(app)
  return app
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

describe('enableShutdownHooks', () => {
  // Nothing may end the process the tests run in.
  let kill: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
  })

  afterEach(async () => {
    await settleWithin(apps.splice(0).map((app) => app.close()))
    kill.mockRestore()
  })

  it('closes the application and then lets the signal end the process', async () => {
    const log: string[] = []
    const app = create(async () => {
      await tick()
      log.push('stopped')
      expect(kill).not.toHaveBeenCalled()
    })
    await app.init()
    app.enableShutdownHooks([SIGNAL])

    process.emit(SIGNAL)
    await app.close()
    await tick()

    expect(log).toEqual(['stopped'])
    expect(kill.mock.calls).toEqual([[process.pid, SIGNAL]])
  })

  it('leaves the process running when asked to', async () => {
    const app = create()
    app.enableShutdownHooks([SIGNAL], { exit: false })

    process.emit(SIGNAL)
    await app.close()
    await tick()

    expect(kill).not.toHaveBeenCalled()
  })

  it('leaves the process to whoever else listens to the signal', async () => {
    const other = vi.fn()
    process.on(SIGNAL, other)
    try {
      const app = create()
      app.enableShutdownHooks([SIGNAL])

      process.emit(SIGNAL)
      await app.close()
      await tick()

      expect(other).toHaveBeenCalledTimes(1)
      expect(kill).not.toHaveBeenCalled()
    } finally {
      process.off(SIGNAL, other)
    }
  })

  it('does not let one application end the process before another has closed', async () => {
    const slow = gate()
    const fast = create()
    const draining = create(() => slow.opened)
    await fast.init()
    await draining.init()
    fast.enableShutdownHooks([SIGNAL])
    draining.enableShutdownHooks([SIGNAL])

    process.emit(SIGNAL)
    await fast.close()
    await tick()
    expect(kill).not.toHaveBeenCalled()
    slow.open()
    await draining.close()
    await tick()

    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('waits for an application that was already closing by itself', async () => {
    const slow = gate()
    const fast = create()
    const draining = create(() => slow.opened)
    await draining.init()
    fast.enableShutdownHooks([SIGNAL])
    draining.enableShutdownHooks([SIGNAL])

    const closing = draining.close()
    process.emit(SIGNAL)
    await fast.close()
    await tick()
    expect(kill).not.toHaveBeenCalled()
    slow.open()
    await closing
    await tick()

    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('lets an application that is closing by itself finish before the signal ends the process', async () => {
    const slow = gate()
    const app = create(() => slow.opened)
    await app.init()
    app.enableShutdownHooks([SIGNAL])

    const closing = app.close()
    await tick()
    expect(process.listenerCount(SIGNAL)).toBe(1)
    process.emit(SIGNAL)
    await tick()
    expect(kill).not.toHaveBeenCalled()
    slow.open()
    await closing
    await tick()

    expect(kill.mock.calls).toEqual([[process.pid, SIGNAL]])
    expect(process.listenerCount(SIGNAL)).toBe(0)
  })

  it('lets an application that failed to start finish its shutdown as well', async () => {
    const slow = gate()
    const failing = defineTransport({
      name: 'failing',
      create: () => ({
        setup() {
          throw new Error('set-up failed')
        },
        stop: () => slow.opened,
      }),
    })
    class Root {}
    const app = createApplication(registerModule(Root), {
      logger: false,
      transports: [failing()],
    })
    apps.push(app)
    app.enableShutdownHooks([SIGNAL])
    const init = app.init().catch((error: Error) => error.message)
    await tick()

    process.emit(SIGNAL)
    await tick()
    expect(kill).not.toHaveBeenCalled()
    slow.open()
    await init
    await tick()

    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('does not wait for anything on a second signal, whichever it is', async () => {
    const OTHER = 'SIGUSR1'
    const slow = gate()
    const app = create(() => slow.opened)
    await app.init()
    app.enableShutdownHooks([SIGNAL, OTHER])

    process.emit(SIGNAL)
    await tick()

    expect(process.listenerCount(SIGNAL)).toBe(0)
    expect(process.listenerCount(OTHER)).toBe(0)
    slow.open()
    await app.close()
  })

  it('exits by itself as process 1, whose signals do nothing by default', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    const pid = Object.getOwnPropertyDescriptor(process, 'pid')!
    Object.defineProperty(process, 'pid', { ...pid, value: 1 })
    try {
      const app = create()
      app.enableShutdownHooks(['SIGTERM'])

      process.emit('SIGTERM')
      await app.close()
      await tick()

      expect(exit.mock.calls).toEqual([[143]])
      expect(kill).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'pid', pid)
      exit.mockRestore()
    }
  })

  it('installs one listener per signal, however many applications there are', async () => {
    const before = process.listenerCount(SIGNAL)
    const many = Array.from({ length: 12 }, () => create())
    for (const app of many) {
      app.enableShutdownHooks([SIGNAL])
      app.enableShutdownHooks([SIGNAL])
    }

    expect(process.listenerCount(SIGNAL)).toBe(before + 1)
    for (const app of many.slice(1)) {
      await app.close()
    }
    expect(process.listenerCount(SIGNAL)).toBe(before + 1)
    await many[0].close()
    expect(process.listenerCount(SIGNAL)).toBe(before)
    expect(kill).not.toHaveBeenCalled()
  })

  it('refuses a closed application', async () => {
    const app = create()
    await app.close()

    expect(() => app.enableShutdownHooks([SIGNAL])).toThrow('[Navios] The application is closed.')
    expect(process.listenerCount(SIGNAL)).toBe(0)
  })

  it('passes the signal to the shutdown hooks', async () => {
    const signals: unknown[] = []
    class Root {
      onApplicationShutdown(signal?: string) {
        signals.push(signal)
      }
    }
    const app = createApplication(registerModule(Root), { logger: false })
    await app.init()
    app.enableShutdownHooks([SIGNAL])

    process.emit(SIGNAL)
    await app.close()

    expect(signals).toEqual([SIGNAL])
  })
})

describe('a process that receives SIGTERM', () => {
  const script = fileURLToPath(new URL('./shutdown-process.mts', import.meta.url))

  function run(mode: string, ...times: number[]) {
    return new Promise<{ code: number | null; signal: string | null; out: string }>((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script, mode])
      let out = ''
      child.stderr.on('data', (chunk) => (out += chunk))
      child.stdout.on('data', (chunk) => {
        const ready = !out.includes('ready')
        out += chunk
        if (ready && out.includes('ready')) {
          for (const ms of [0, ...times]) {
            setTimeout(() => child.kill('SIGTERM'), ms)
          }
        }
      })
      const limit = setTimeout(() => child.kill('SIGKILL'), 8000)
      child.on('exit', (code, signal) => {
        clearTimeout(limit)
        resolve({ code, signal, out })
      })
    })
  }

  it('closes and ends, although a timer is left', async () => {
    const { signal, out } = await run('keepalive')

    expect(out).toContain('closed')
    expect(signal).toBe('SIGTERM')
  }, 15_000)

  it('finishes its shutdown when it was still starting', async () => {
    const { signal, code, out } = await run('starting')

    expect(out).toContain('closed')
    expect(out).not.toContain('started')
    expect(signal ?? code).toBe('SIGTERM')
  }, 15_000)

  it('ends although its start-up hangs', async () => {
    const { signal, out } = await run('hung-init')

    expect(out).toContain('closed')
    expect(signal).toBe('SIGTERM')
  }, 15_000)

  it('finishes a shutdown that was already under way', async () => {
    const { signal, out } = await run('closing')

    expect(out).toContain('closed')
    expect(signal).toBe('SIGTERM')
  }, 15_000)

  it('exits with the code of the signal when it is process 1', async () => {
    const { signal, code, out } = await run('process-1')

    expect(out).toContain('closed')
    expect([signal, code]).toEqual([null, 143])
  }, 15_000)

  it('exits with the same code when the runtime has no node:os', async () => {
    const { signal, code, out } = await run('process-1-without-os')

    expect(out).toContain('closed')
    expect([signal, code]).toEqual([null, 143])
  }, 15_000)

  it('ends at once on a second signal', async () => {
    const { signal, out } = await run('hung-hook', 200)

    expect(out).not.toContain('closed')
    expect(signal).toBe('SIGTERM')
  }, 15_000)
})
