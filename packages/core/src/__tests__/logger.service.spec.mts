import { Container } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoggerService } from '../index.mjs'

import { LoggerInstance } from '../logger/logger.service.mjs'
import { LoggerOutput } from '../logger/logger.tokens.mjs'

describe('LoggerInstance', () => {
  let container: Container
  let mockLoggerOutput: {
    log: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
    verbose: ReturnType<typeof vi.fn>
    fatal: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    container = new Container()
    mockLoggerOutput = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      fatal: vi.fn(),
    }
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('log', () => {
    it('should call localInstance.log with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.log('Test message')

      expect(mockLoggerOutput.log).toHaveBeenCalledWith('Test message')
    })
  })

  describe('error', () => {
    it('should call localInstance.error with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.error('Error message')

      expect(mockLoggerOutput.error).toHaveBeenCalledWith('Error message')
    })
  })

  describe('warn', () => {
    it('should call localInstance.warn with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.warn('Warning message')

      expect(mockLoggerOutput.warn).toHaveBeenCalledWith('Warning message')
    })
  })

  describe('debug', () => {
    it('should call localInstance.debug with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.debug('Debug message')

      expect(mockLoggerOutput.debug).toHaveBeenCalledWith('Debug message')
    })

    it('should handle missing debug method gracefully', async () => {
      const loggerWithoutDebug = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        // No debug method
      }

      container.addInstance(LoggerOutput, loggerWithoutDebug as LoggerService)
      const logger = await container.get(LoggerInstance)

      // Should not throw
      expect(() => logger.debug('Debug message')).not.toThrow()
    })
  })

  describe('verbose', () => {
    it('should call localInstance.verbose with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.verbose('Verbose message')

      expect(mockLoggerOutput.verbose).toHaveBeenCalledWith('Verbose message')
    })

    it('should handle missing verbose method gracefully', async () => {
      const loggerWithoutVerbose = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        // No verbose method
      }

      container.addInstance(LoggerOutput, loggerWithoutVerbose as LoggerService)
      const logger = await container.get(LoggerInstance)

      // Should not throw
      expect(() => logger.verbose('Verbose message')).not.toThrow()
    })
  })

  describe('fatal', () => {
    it('should call localInstance.fatal with message', async () => {
      container.addInstance(LoggerOutput, mockLoggerOutput as LoggerService)
      const logger = await container.get(LoggerInstance)

      logger.fatal('Fatal message')

      expect(mockLoggerOutput.fatal).toHaveBeenCalledWith('Fatal message')
    })

    it('should handle missing fatal method gracefully', async () => {
      const loggerWithoutFatal = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        // No fatal method
      }

      container.addInstance(LoggerOutput, loggerWithoutFatal as LoggerService)
      const logger = await container.get(LoggerInstance)

      // Should not throw
      expect(() => logger.fatal('Fatal message')).not.toThrow()
    })
  })
})
