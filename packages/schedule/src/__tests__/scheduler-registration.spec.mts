import { Container, LoggerOutput } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cron, Schedulable, SchedulerService } from '../index.mjs'

const loggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

describe('SchedulerService registration and ticks', () => {
  let container: Container
  let schedulerService: SchedulerService

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
    container = new Container()
    container.addInstance(LoggerOutput, loggerOutput)
    schedulerService = await container.get(SchedulerService)
  })

  afterEach(async () => {
    await container.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('invalid cron expression', () => {
    it('should name the class and method and register nothing', () => {
      @Schedulable()
      class BadService {
        @Cron('*/1 * * * * *')
        async ok() {}

        @Cron('not a cron')
        async bad() {}
      }

      expect(() => schedulerService.register(BadService)).toThrow(/BadService\.bad\(\)/)
      expect(schedulerService.getJob(BadService, 'ok')).toBeUndefined()
      expect(schedulerService.getJob(BadService, 'bad')).toBeUndefined()
    })

    it('should throw again on a second registration instead of ignoring it', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class BadService {
        @Cron('*/1 * * * * *')
        async ok() {
          mockJob()
        }

        @Cron('not a cron')
        async bad() {}
      }

      expect(() => schedulerService.register(BadService)).toThrow()
      expect(() => schedulerService.register(BadService)).toThrow(/BadService\.bad\(\)/)

      schedulerService.start()
      await vi.advanceTimersByTimeAsync(2000)
      expect(mockJob).not.toHaveBeenCalled()
    })

    it('should start nothing of a service that fails to register on a started scheduler', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class BadService {
        @Cron('*/1 * * * * *')
        async ok() {
          mockJob()
        }

        @Cron('0 4 * * *', { timeZone: 'Nowhere/Land' })
        async bad() {}
      }

      schedulerService.start()
      expect(() => schedulerService.register(BadService)).toThrow(/BadService\.bad\(\)/)
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockJob).not.toHaveBeenCalled()
    })
  })

  describe('a tick that cannot create its scope', () => {
    it('should log the error and not reject', async () => {
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async job() {}
      }

      schedulerService.register(TestService)
      schedulerService.start()
      const createScope = vi
        .spyOn((schedulerService as any).container as Container, 'createScope')
        .mockImplementation(() => {
          throw new Error('createScope failed')
        })
      try {
        await vi.advanceTimersByTimeAsync(1000)
        await schedulerService.stop()
        vi.useRealTimers()
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(createScope).toHaveBeenCalledTimes(1)
        expect(unhandled).not.toHaveBeenCalled()
        expect(consoleError).not.toHaveBeenCalled()
        expect(loggerOutput.error).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify(loggerOutput.error.mock.calls[0])
        expect(logged).toContain('TestService.job()')
      } finally {
        process.off('unhandledRejection', unhandled)
        createScope.mockRestore()
      }
    })
  })

  describe('errors raised by the cron library', () => {
    it('should go to the logger, not to the console', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async job() {}
      }

      schedulerService.register(TestService)
      schedulerService.start()
      vi.spyOn(schedulerService as any, 'run').mockImplementation(() => {
        throw new Error('tick failed')
      })
      await vi.advanceTimersByTimeAsync(1000)

      expect(consoleError).not.toHaveBeenCalled()
      expect(loggerOutput.error).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(loggerOutput.error.mock.calls[0])).toContain('TestService.job()')
    })
  })

  describe('timeZone', () => {
    it('should run the job at the given time in the given time zone', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        // 04:00 in Kyiv is 02:00 UTC in winter.
        @Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })
        async job() {
          mockJob()
        }
      }

      schedulerService.register(TestService)
      schedulerService.start()

      const next = schedulerService.getJob(TestService, 'job')!.nextDate()
      expect(next.toUTC().toISO()).toBe('2021-01-01T02:00:00.000Z')

      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000 - 1000)
      expect(mockJob).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockJob).toHaveBeenCalledTimes(1)
    })
  })
})
