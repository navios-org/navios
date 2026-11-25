import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsoleLogger } from '../logger/console-logger.mjs'

function written(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call: unknown[]) => call[0] as string)
}

describe('ConsoleLogger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  describe('static create()', () => {
    it('should create a logger instance with default options', () => {
      const logger = ConsoleLogger.create()

      expect(logger).toBeInstanceOf(ConsoleLogger)
    })

    it('should create a logger instance with context', () => {
      const logger = ConsoleLogger.create('TestContext')

      logger.log('test message')

      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls[0]?.[0] as string
      expect(output).toContain('[TestContext]')
    })

    it('should create a logger instance with options', () => {
      const logger = ConsoleLogger.create({
        showPid: false,
        showPrefix: false,
      })

      logger.log('test message')

      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls[0]?.[0] as string
      expect(output).not.toContain('[Navios]')
      expect(output).not.toContain(process.pid.toString())
    })

    it('should create a logger instance with context and options', () => {
      const logger = ConsoleLogger.create('TestContext', {
        showPid: false,
      })

      logger.log('test message')

      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls[0]?.[0] as string
      expect(output).toContain('[TestContext]')
      expect(output).not.toContain(process.pid.toString())
    })
  })

  describe('display options', () => {
    describe('showPid', () => {
      it('should show PID by default', () => {
        const logger = ConsoleLogger.create()

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toContain(process.pid.toString())
      })

      it('should hide PID when showPid is false', () => {
        const logger = ConsoleLogger.create({ showPid: false })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toContain(` ${process.pid} `)
      })
    })

    describe('showPrefix', () => {
      it('should show prefix by default', () => {
        const logger = ConsoleLogger.create()

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toContain('[Navios]')
      })

      it('should hide prefix when showPrefix is false', () => {
        const logger = ConsoleLogger.create({ showPrefix: false })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toContain('[Navios]')
      })

      it('should use custom prefix when provided', () => {
        const logger = ConsoleLogger.create({ prefix: 'MyApp' })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toContain('[MyApp]')
      })
    })

    describe('showLogLevel', () => {
      it('should show log level by default', () => {
        const logger = ConsoleLogger.create()

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toContain('LOG')
      })

      it('should hide log level when showLogLevel is false', () => {
        const logger = ConsoleLogger.create({ showLogLevel: false })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toContain('LOG')
      })
    })

    describe('showContext', () => {
      it('should show context by default', () => {
        const logger = ConsoleLogger.create('TestContext')

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toContain('[TestContext]')
      })

      it('should hide context when showContext is false', () => {
        const logger = ConsoleLogger.create('TestContext', { showContext: false })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toContain('[TestContext]')
      })
    })

    describe('showTimestamp', () => {
      it('should show timestamp by default', () => {
        const logger = ConsoleLogger.create()

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        // Timestamp format includes date separators
        expect(output).toMatch(/\d{2}\/\d{2}\/\d{4}/)
      })

      it('should hide timestamp when showTimestamp is false', () => {
        const logger = ConsoleLogger.create({ showTimestamp: false })

        logger.log('test message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
      })
    })

    describe('showTimeDiff', () => {
      it('should not show time diff by default', () => {
        const logger = ConsoleLogger.create()

        logger.log('first message')
        logger.log('second message')

        const output = stdoutSpy.mock.calls[1]?.[0] as string
        expect(output).not.toMatch(/\+\d+ms/)
      })

      it('should show time diff when showTimeDiff is true', () => {
        const logger = ConsoleLogger.create({ showTimeDiff: true })

        logger.log('first message')
        logger.log('second message')

        const output = stdoutSpy.mock.calls[1]?.[0] as string
        expect(output).toMatch(/\+\d+ms/)
      })

      it('should not show time diff on first message even when enabled', () => {
        const logger = ConsoleLogger.create({ showTimeDiff: true })

        logger.log('first message')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).not.toMatch(/\+\d+ms/)
      })
    })

    describe('minimal output for CLI', () => {
      it('should output only message when all display options are disabled', () => {
        const logger = ConsoleLogger.create({
          showPid: false,
          showPrefix: false,
          showLogLevel: false,
          showContext: false,
          showTimestamp: false,
          colors: false,
        })

        logger.log('hello world')

        const output = stdoutSpy.mock.calls[0]?.[0] as string
        expect(output).toBe('hello world\n')
      })
    })
  })

  describe('log levels', () => {
    it('should write to stdout for log level', () => {
      const logger = ConsoleLogger.create()
      logger.log('test')
      expect(stdoutSpy).toHaveBeenCalled()
    })

    it('should write to stderr for error level', () => {
      const logger = ConsoleLogger.create()
      logger.error('test')
      expect(stderrSpy).toHaveBeenCalled()
    })

    it('should write to stdout for warn level', () => {
      const logger = ConsoleLogger.create()
      logger.warn('test')
      expect(stdoutSpy).toHaveBeenCalled()
    })

    it('should write to stdout for debug level', () => {
      const logger = ConsoleLogger.create()
      logger.debug('test')
      expect(stdoutSpy).toHaveBeenCalled()
    })

    it('should write to stdout for verbose level', () => {
      const logger = ConsoleLogger.create()
      logger.verbose('test')
      expect(stdoutSpy).toHaveBeenCalled()
    })

    it('should write to stdout for fatal level', () => {
      const logger = ConsoleLogger.create()
      logger.fatal('test')
      expect(stdoutSpy).toHaveBeenCalled()
    })
  })

  describe('setContext', () => {
    it('should update context', () => {
      const logger = ConsoleLogger.create('InitialContext')
      logger.setContext('NewContext')

      logger.log('test message')

      const output = stdoutSpy.mock.calls[0]?.[0] as string
      expect(output).toContain('[NewContext]')
      expect(output).not.toContain('[InitialContext]')
    })
  })

  describe('resetContext', () => {
    it('should reset to original context', () => {
      const logger = ConsoleLogger.create('OriginalContext')
      logger.setContext('TempContext')
      logger.resetContext()

      logger.log('test message')

      const output = stdoutSpy.mock.calls[0]?.[0] as string
      expect(output).toContain('[OriginalContext]')
    })
  })

  describe('setLogLevels', () => {
    it('should filter messages based on log levels', () => {
      const logger = ConsoleLogger.create()
      logger.setLogLevels(['error'])

      logger.log('should not appear')
      logger.error('should appear')

      expect(stdoutSpy).not.toHaveBeenCalled()
      expect(stderrSpy).toHaveBeenCalled()
    })
  })

  describe('isLevelEnabled', () => {
    it('should return true for enabled levels', () => {
      const logger = ConsoleLogger.create()
      logger.setLogLevels(['log', 'error'])

      expect(logger.isLevelEnabled('log')).toBe(true)
      expect(logger.isLevelEnabled('error')).toBe(true)
      expect(logger.isLevelEnabled('debug')).toBe(false)
    })
  })

  describe('new ConsoleLogger()', () => {
    it('prints every level with the default options', () => {
      const logger = new ConsoleLogger()

      logger.error('broken')
      logger.debug('detail')

      expect(stderrSpy.mock.calls[0]?.[0]).toContain('broken')
      expect(stdoutSpy.mock.calls[0]?.[0]).toContain('[Navios]')
    })

    it('takes what create() takes', () => {
      new ConsoleLogger('Ctx').log('one')
      new ConsoleLogger({ prefix: 'Mine' }).log('two')
      new ConsoleLogger('Ctx', { prefix: 'Mine' }).log('three')

      const lines = written(stdoutSpy)
      expect(lines[0]).toContain('[Ctx]')
      expect(lines[1]).toContain('[Mine]')
      expect(lines[2]).toContain('[Ctx]')
      expect(lines[2]).toContain('[Mine]')
    })

    it('works for a subclass', () => {
      class Custom extends ConsoleLogger {
        protected override formatPid() {
          return '[custom]'
        }
      }

      new Custom().log('hello')
      ;(Custom.create({ showTimestamp: false }) as Custom).log('again')

      expect(stdoutSpy.mock.calls[0]?.[0]).toContain('[custom]')
      expect(stdoutSpy.mock.calls[1]?.[0]).toContain('[custom]')
    })
  })

  describe('options', () => {
    it('leaves the options it was given alone', () => {
      const options = Object.freeze({ json: true })

      expect(() => ConsoleLogger.create(options)).not.toThrow()
    })

    it('keeps what an earlier setup() set', () => {
      const logger = new ConsoleLogger({ prefix: 'Mine', colors: false })

      logger.setup({ showPid: false })
      logger.log('hello')

      expect(stdoutSpy.mock.calls[0]?.[0]).toMatch(/^\[Mine\] - /)
    })

    it('colours the output only when stdout is a terminal', () => {
      const { isTTY } = process.stdout
      const colour = '\x1b['
      vi.stubEnv('NO_COLOR', '')
      try {
        process.stdout.isTTY = true
        new ConsoleLogger().log('terminal')
        new ConsoleLogger({ json: true }).log('json')
        process.stdout.isTTY = false
        new ConsoleLogger().log('pipe')
        new ConsoleLogger({ colors: true }).log('asked for')
      } finally {
        process.stdout.isTTY = isTTY
        vi.unstubAllEnvs()
      }

      const lines = written(stdoutSpy)
      expect(lines.map((line) => line.includes(colour))).toEqual([true, false, false, true])
    })

    it('prints `log` and above in production by default', () => {
      vi.stubEnv('NODE_ENV', 'production')
      try {
        const logger = new ConsoleLogger()
        logger.verbose('verbose')
        logger.debug('debug')
        logger.log('log')
        logger.fatal('fatal')
        new ConsoleLogger({ logLevels: ['debug'] }).debug('asked for')
      } finally {
        vi.unstubAllEnvs()
      }

      const printed = written(stdoutSpy).join('')
      expect(printed).not.toContain('VERBOSE')
      expect(printed).toContain(' log\n')
      expect(printed).toContain(' fatal\n')
      expect(printed).not.toContain(' debug\n')
      expect(printed).toContain('asked for')
    })
  })

  describe('error()', () => {
    const plain = { colors: false, showTimestamp: false, showPid: false }
    const printed = () => written(stderrSpy).join('')

    it('prints an error given without a context, with its stack and cause, once', () => {
      const error = new Error('boom', { cause: new Error('root cause') })

      new ConsoleLogger(plain).error('failed', error)

      expect(printed()).toContain('failed\n')
      expect(printed()).toContain('root cause')
      expect(printed().match(/Error: boom/g)).toHaveLength(1)
      expect(printed()).not.toContain('[Error: boom')
    })

    it('prints a payload given without a context', () => {
      new ConsoleLogger(plain).error('failed', { orderId: 42 })

      expect(printed()).toContain('orderId: 42')
      expect(printed()).not.toContain('[object Object]')
    })

    it('still takes a string for the context, and a stack for a stack', () => {
      const logger = new ConsoleLogger(plain)

      logger.error('failed', 'Orders')
      logger.error('failed', 'Error: boom\n    at file.mjs:1:1')
      logger.error('failed', 'the stack', 'Orders')

      expect(printed()).toContain('[Orders] failed\n')
      expect(printed()).toContain('failed\nError: boom\n    at file.mjs:1:1\n')
      expect(printed()).toContain('[Orders] failed\nthe stack\n')
    })
  })

  describe('json', () => {
    const lines = (spy: ReturnType<typeof vi.spyOn>) =>
      written(spy).flatMap((text) =>
        text
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line) as Record<string, any>),
      )

    it('puts an error on the line of its message', () => {
      const error = new TypeError('boom', { cause: new Error('root cause') })
      const logger = new ConsoleLogger({ json: true })

      logger.error('failed', error)
      logger.error('failed', error, 'Orders')
      logger.warn('odd', error)
      logger.error(error)

      const [bare, withContext, alone] = lines(stderrSpy)
      expect(bare).toMatchObject({
        message: 'failed',
        error: {
          name: 'TypeError',
          message: 'boom',
          stack: error.stack,
          cause: { name: 'Error', message: 'root cause' },
        },
      })
      expect(bare).not.toHaveProperty('context')
      expect(withContext).toMatchObject({ context: 'Orders', error: { message: 'boom' } })
      expect(alone).toMatchObject({ message: 'boom', error: { name: 'TypeError' } })
      expect(lines(stdoutSpy)).toHaveLength(1)
      expect(lines(stdoutSpy)[0]).toMatchObject({ message: 'odd', error: { message: 'boom' } })
    })

    it('keeps the fields of an error and the errors it holds', () => {
      const logger = new ConsoleLogger({ json: true })
      const first = Object.assign(new Error('one'), { code: 'E1' })
      const request: Record<string, unknown> = { path: '/users' }
      request.self = request
      const failure = Object.assign(new Error('upstream', { cause: first }), {
        code: 'ECONN',
        status: 503,
        detail: { table: 'users', ids: [1, 2n], at: new Map([['a', 1]]) },
        original: first,
        request,
        skipped: undefined,
        retry() {},
      })
      Object.defineProperty(failure, 'broken', {
        enumerable: true,
        get() {
          throw new Error('cannot be read')
        },
      })

      logger.error('failed', failure)
      logger.error('failed', new AggregateError([first, 'text'], 'all failed'))

      const [line, aggregate] = lines(stderrSpy)
      expect(line.error).toEqual({
        name: 'Error',
        message: 'upstream',
        stack: failure.stack,
        cause: { name: 'Error', message: 'one', stack: first.stack, code: 'E1' },
        code: 'ECONN',
        status: 503,
        detail: { table: 'users', ids: [1, '2'], at: "Map(1) { 'a' => 1 }" },
        original: { name: 'Error', message: 'one', stack: first.stack, code: 'E1' },
        request: expect.stringContaining('/users'),
        broken: '[cannot be read: cannot be read]',
      })
      expect(aggregate.error).toMatchObject({
        name: 'AggregateError',
        message: 'all failed',
        errors: [{ message: 'one', code: 'E1' }, 'text'],
      })
    })

    it('never throws', () => {
      const logger = new ConsoleLogger({ json: true })
      const circular: Record<string, unknown> = { name: 'node' }
      circular.self = circular
      const error = Object.assign(new Error('loop'), { errors: [] as unknown[], parent: {} })
      error.cause = error
      error.errors.push(error)
      error.parent = error

      logger.log(circular)
      logger.log({
        toJSON() {
          throw new Error('no json')
        },
      })
      logger.log(
        new Proxy(
          {},
          {
            get() {
              throw new Error('no property')
            },
          },
        ),
      )
      logger.error('failed', error)

      const printed = lines(stdoutSpy)
      expect(printed).toHaveLength(3)
      expect(printed[0].message).toContain('[Circular')
      expect(lines(stderrSpy)[0].error).toMatchObject({
        message: 'loop',
        cause: '[Circular]',
        errors: ['[Circular]'],
        parent: '[Circular]',
      })
    })

    it('inspects what JSON has no word for with the options of the logger', () => {
      const deep = { a: { b: { c: { d: 'deep' } } } }

      new ConsoleLogger({ json: true }).log({ map: new Map([['k', deep]]), big: 10n })

      const [line] = lines(stdoutSpy)
      expect(line.message.map).toContain('deep')
      expect(line.message.big).toBe('10')
    })
  })

  it('never throws because of what it is given', () => {
    const logger = new ConsoleLogger({ colors: false })
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()

    expect(() => logger.log(proxy)).not.toThrow()
    expect(() =>
      logger.log(() => {
        throw new Error('inner')
      }),
    ).not.toThrow()

    expect(stdoutSpy.mock.calls.length + stderrSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
