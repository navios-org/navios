import { Container, LoggerOutput } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cron, extractScheduleMetadata, Schedulable, SchedulerService } from '../index.mjs'
import { Cron as LegacyCron, Schedulable as LegacySchedulable } from '../legacy-compat/index.mjs'

const loggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

const methodsOf = (target: new () => object) =>
  [...extractScheduleMetadata(target).jobs].map((job) => job.classMethod).sort()

/** Applies a legacy method decorator the way TypeScript's `experimentalDecorators` does. */
function decorateMethod(
  target: { prototype: object },
  key: string,
  decorator: (
    prototype: object,
    key: string,
    descriptor: TypedPropertyDescriptor<() => Promise<void>>,
  ) => PropertyDescriptor | void,
) {
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, key)!
  const result = decorator(target.prototype, key, descriptor)
  Object.defineProperty(target.prototype, key, result ?? descriptor)
}

describe('schedule metadata', () => {
  let container: Container

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
    container = new Container()
    container.addInstance(LoggerOutput, loggerOutput)
  })

  afterEach(async () => {
    await container.dispose()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('inheritance', () => {
    it('should give a subclass its own metadata and leave the parent untouched', () => {
      @Schedulable()
      class Base {
        @Cron('*/1 * * * * *')
        async a() {}
      }

      @Schedulable()
      class Child extends Base {
        @Cron('*/1 * * * * *')
        async b() {}
      }

      expect(methodsOf(Base)).toEqual(['a'])
      expect(extractScheduleMetadata(Base).name).toBe('Base')
      expect(methodsOf(Child)).toEqual(['a', 'b'])
      expect(extractScheduleMetadata(Child).name).toBe('Child')
      expect(extractScheduleMetadata(Child)).not.toBe(extractScheduleMetadata(Base))
      expect(extractScheduleMetadata(Child).jobs).not.toBe(extractScheduleMetadata(Base).jobs)
    })

    it('should not change the schedule of the parent when a subclass reschedules a method', () => {
      @Schedulable()
      class Base {
        @Cron('*/1 * * * * *')
        async a() {}
      }

      @Schedulable()
      class Child extends Base {
        @Cron('*/5 * * * * *', { disabled: true })
        override async a() {}
      }

      expect([...extractScheduleMetadata(Base).jobs]).toEqual([
        { classMethod: 'a', cronTime: '*/1 * * * * *', disabled: false },
      ])
      expect([...extractScheduleMetadata(Child).jobs]).toEqual([
        { classMethod: 'a', cronTime: '*/5 * * * * *', disabled: true },
      ])
    })

    it('should run inherited and own jobs on the subclass only', async () => {
      const calls: string[] = []

      @Schedulable()
      class Base {
        @Cron('*/1 * * * * *')
        async a() {
          calls.push(`${this.constructor.name}.a`)
        }
      }

      @Schedulable()
      class Child extends Base {
        @Cron('*/1 * * * * *')
        async b() {
          calls.push(`${this.constructor.name}.b`)
        }
      }

      const scheduler = await container.get(SchedulerService)
      scheduler.register(Child)
      scheduler.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(calls.sort()).toEqual(['Child.a', 'Child.b'])
      expect(scheduler.getJob(Child, 'a')?.name).toBe('Child.a()')
      expect(scheduler.getJob(Base, 'a')).toBeUndefined()
    })

    it('should behave the same with the legacy decorators', () => {
      class Base {
        async a() {}
      }
      decorateMethod(Base, 'a', LegacyCron('*/1 * * * * *'))
      LegacySchedulable()(Base)

      class Child extends Base {
        async b() {}
      }
      decorateMethod(Child, 'b', LegacyCron('*/1 * * * * *'))
      LegacySchedulable()(Child)

      expect(methodsOf(Base)).toEqual(['a'])
      expect(extractScheduleMetadata(Base).name).toBe('Base')
      expect(methodsOf(Child)).toEqual(['a', 'b'])
      expect(extractScheduleMetadata(Child).name).toBe('Child')
      const inherited = [...extractScheduleMetadata(Child).jobs].find((j) => j.classMethod === 'a')
      expect([...extractScheduleMetadata(Base).jobs]).not.toContain(inherited)
    })
  })

  describe('@Cron', () => {
    it('should key the job by the method name when another decorator wraps the method', async () => {
      const mockJob = vi.fn()
      const wrap = (target: () => Promise<void>) =>
        function (this: unknown) {
          return target.call(this)
        }

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        @wrap
        async job() {
          mockJob()
        }
      }

      expect(methodsOf(TestService)).toEqual(['job'])

      const scheduler = await container.get(SchedulerService)
      scheduler.register(TestService)
      scheduler.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockJob).toHaveBeenCalledTimes(1)
      expect(loggerOutput.error).not.toHaveBeenCalled()
    })

    it('should accept a synchronous method', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        job() {
          mockJob()
        }
      }

      const scheduler = await container.get(SchedulerService)
      scheduler.register(TestService)
      scheduler.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockJob).toHaveBeenCalledTimes(1)
    })

    it('should throw when applied twice to one method', () => {
      expect(() => {
        @Schedulable()
        class TestService {
          @Cron('*/1 * * * * *')
          @Cron('*/5 * * * * *')
          async job() {}
        }
        return TestService
      }).toThrow(/job.*more than one @Cron/)
    })

    it('should throw when the legacy decorator is applied twice to one method', () => {
      class TestService {
        async job() {}
      }
      decorateMethod(TestService, 'job', LegacyCron('*/1 * * * * *'))

      expect(() => decorateMethod(TestService, 'job', LegacyCron('*/5 * * * * *'))).toThrow(
        /more than one @Cron/,
      )
    })

    it('should keep the time zone in the metadata', () => {
      @Schedulable()
      class TestService {
        @Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })
        async job() {}
      }

      expect([...extractScheduleMetadata(TestService).jobs][0]).toMatchObject({
        classMethod: 'job',
        timeZone: 'Europe/Kyiv',
      })
    })
  })
})
