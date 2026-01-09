import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsoleLogger } from '../logger/console-logger.service.mjs'

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
})
