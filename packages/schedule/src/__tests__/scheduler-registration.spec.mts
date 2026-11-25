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

  describe('a job that cannot be scheduled', () => {
    it.each([
      ['an empty expression', '', undefined, /the cron expression is empty/],
      ['a blank expression', '  ', undefined, /the cron expression is empty/],
      ['an expression that is not set', undefined as unknown as string, undefined, /is empty/],
      ['an empty time zone', '0 4 * * *', '', /the time zone is empty/],
      ['an unknown time zone', '0 4 * * *', 'Nowhere/Land', /Invalid timezone/],
      ['an expression that never occurs', '0 0 31 2 *', undefined, /'0 0 31 2 \*' never occurs/],
      ['too many fields', '* * * * * * *', undefined, /Too many fields/],
    ])('should name the class and method of %s', (_, expression, timeZone, message) => {
      @Schedulable()
      class BadService {
        @Cron('*/1 * * * * *')
        async ok() {}

        @Cron(expression, { timeZone })
        async bad() {}
      }

      for (const started of [false, true]) {
        if (started) {
          schedulerService.start()
        }
        expect(() => schedulerService.register(BadService)).toThrow(/BadService\.bad\(\)/)
        expect(() => schedulerService.register(BadService)).toThrow(message)
        expect(schedulerService.getJob(BadService, 'ok')).toBeUndefined()
      }
      expect(vi.getTimerCount()).toBe(0)
    })

    it('should stop what start() started when a job cannot be started', () => {
      @Schedulable()
      class Good {
        @Cron('*/1 * * * * *')
        async job() {}
      }
      @Schedulable()
      class Bad {
        @Cron('*/1 * * * * *')
        async job() {}
      }
      schedulerService.register(Good)
      schedulerService.register(Bad)
      vi.spyOn((schedulerService.getJob(Bad, 'job') as any).timer, 'arm').mockImplementation(() => {
        throw new Error('nothing left')
      })

      expect(() => schedulerService.start()).toThrow(/Bad\.job\(\): nothing left/)
      expect(schedulerService.getJob(Good, 'job')?.active).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('should refuse a subclass that is not decorated itself', () => {
      @Schedulable()
      class Base {
        @Cron('*/1 * * * * *')
        async job() {}
      }
      class Child extends Base {}

      expect(() => schedulerService.register(Child)).toThrow(/Child is not schedulable/)
    })
  })

  describe('warnings', () => {
    it('should warn about a class registered on a scheduler that nothing started', () => {
      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async job() {}
      }

      schedulerService.register(TestService)

      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn.mock.calls[0][0]).toMatch(/TestService.*scheduleTransport\(\)/)
    })

    it('should not warn when the scheduler is started', () => {
      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async job() {}
      }

      schedulerService.start()
      schedulerService.register(TestService)

      expect(loggerOutput.warn).not.toHaveBeenCalled()
    })

    it('should warn about a schedulable class without jobs', () => {
      @Schedulable()
      class TestService {}

      schedulerService.start()
      schedulerService.register(TestService)

      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn.mock.calls[0][0]).toMatch(/TestService.*@Cron/)
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
})
