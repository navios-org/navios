import { Container, createApplication, InjectableScope, LoggerOutput } from '@navios/core'
import { Module } from '@navios/core/legacy-compat'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scheduleTransport, SchedulerService } from '../index.mjs'
import { Cron, Schedulable } from '../legacy-compat/index.mjs'
import { extractScheduleMetadata, hasScheduleMetadata } from '../schedulable/schedule-metadata.mjs'

const loggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

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

describe('legacy-compat decorators', () => {
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
  })

  it('should collect cron metadata and make the class injectable', async () => {
    class TestService {
      async first() {}
      async second() {}
    }
    decorateMethod(TestService, 'first', Cron('*/1 * * * * *'))
    decorateMethod(TestService, 'second', Cron('*/2 * * * * *', { disabled: true }))
    Schedulable()(TestService)

    expect(hasScheduleMetadata(TestService)).toBe(true)
    const metadata = extractScheduleMetadata(TestService)
    expect(metadata.name).toBe('TestService')
    expect([...metadata.jobs]).toEqual([
      { classMethod: 'first', cronTime: '*/1 * * * * *', disabled: false, overlap: 'skip' },
      { classMethod: 'second', cronTime: '*/2 * * * * *', disabled: true, overlap: 'skip' },
    ])
    expect(await container.get(TestService)).toBeInstanceOf(TestService)
  })

  it('should keep the metadata of different classes apart', () => {
    class First {
      async job() {}
    }
    class Second {
      async other() {}
    }
    decorateMethod(First, 'job', Cron('*/1 * * * * *'))
    decorateMethod(Second, 'other', Cron('*/1 * * * * *'))
    Schedulable()(First)
    Schedulable()(Second)

    expect([...extractScheduleMetadata(First).jobs].map((job) => job.classMethod)).toEqual(['job'])
    expect([...extractScheduleMetadata(Second).jobs].map((job) => job.classMethod)).toEqual([
      'other',
    ])
  })

  it('should run a legacy-decorated service with the scheduler', async () => {
    const mockJob = vi.fn()

    class TestService {
      async testJob() {
        mockJob(this)
      }
    }
    decorateMethod(TestService, 'testJob', Cron('*/1 * * * * *'))
    Schedulable({ scope: InjectableScope.Request })(TestService)

    const scheduler = await container.get(SchedulerService)
    scheduler.register(TestService)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(2000)

    expect(mockJob).toHaveBeenCalledTimes(2)
    expect(mockJob.mock.calls[0][0]).toBeInstanceOf(TestService)
    expect(mockJob.mock.calls[0][0]).not.toBe(mockJob.mock.calls[1][0])
  })

  it('should run the jobs of a legacy-decorated module', async () => {
    const mockJob = vi.fn()

    class TestService {
      async testJob() {
        mockJob()
      }
    }
    decorateMethod(TestService, 'testJob', Cron('*/1 * * * * *'))
    Schedulable()(TestService)

    class AppModule {}
    Module({ jobs: [TestService] })(AppModule)

    const app = createApplication(AppModule, {
      logger: false,
      transports: [scheduleTransport()],
    })
    await app.start()
    await vi.advanceTimersByTimeAsync(1000)
    await app.close()

    expect(mockJob).toHaveBeenCalledTimes(1)
  })
})
