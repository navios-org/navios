import { Module } from '@navios/core'
import { Module as LegacyModule } from '@navios/core/legacy-compat'
import { describe, expectTypeOf, it } from 'vitest'

import { Cron, Schedulable, scheduleTransport, SchedulerService } from '../index.mjs'
import { Cron as LegacyCron } from '../legacy-compat/index.mjs'

import type { CronOptions, JobRun, ScheduledJob, ScheduleTransportOptions } from '../index.mjs'

describe('@Cron', () => {
  it('should accept synchronous and asynchronous methods, whatever they return', () => {
    class TestService {
      @Cron('* * * * *')
      sync() {}

      @Cron('* * * * *')
      async asynchronous() {}

      @Cron('* * * * *')
      async count() {
        return 1
      }
    }

    expectTypeOf(new TestService().sync).returns.toEqualTypeOf<void>()
    expectTypeOf(new TestService().asynchronous).returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf(new TestService().count).returns.toEqualTypeOf<Promise<number>>()
  })

  it('should accept a method that takes the run', () => {
    class TestService {
      @Cron('* * * * *')
      job({ name, scheduledAt, signal }: JobRun) {
        expectTypeOf(name).toEqualTypeOf<string>()
        expectTypeOf(scheduledAt).toEqualTypeOf<Date | null>()
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
      }
    }

    expectTypeOf(new TestService().job).parameter(0).toEqualTypeOf<JobRun>()
  })

  it('should reject a method that takes other arguments', () => {
    const decorator = Cron('* * * * *')
    const context = {} as ClassMethodDecoratorContext

    // @ts-expect-error a job is called with a JobRun
    decorator((value: string) => value.length, context)
    // @ts-expect-error a job is called with one argument
    decorator((run: JobRun, value: string) => [run, value], context)
  })

  it('should take the expression as a string only', () => {
    // @ts-expect-error a date is not an expression
    Cron(new Date())
  })

  it('should accept the same methods in the legacy decorator', () => {
    const decorator = LegacyCron('* * * * *')

    decorator({}, 'sync', {} as TypedPropertyDescriptor<() => void>)
    decorator({}, 'asynchronous', {} as TypedPropertyDescriptor<() => Promise<number>>)
    decorator({}, 'run', {} as TypedPropertyDescriptor<(run: JobRun) => void>)
    // @ts-expect-error a job is called with a JobRun
    decorator({}, 'other', {} as TypedPropertyDescriptor<(value: string) => void>)
  })

  it('should take a time zone and an overlap policy', () => {
    expectTypeOf<CronOptions>().toHaveProperty('timeZone').toEqualTypeOf<string | undefined>()
    expectTypeOf<CronOptions>()
      .toHaveProperty('overlap')
      .toEqualTypeOf<'skip' | 'allow' | undefined>()
  })
})

describe('SchedulerService', () => {
  it('should look a job up by the methods that can be jobs', () => {
    @Schedulable()
    class TestService {
      readonly value = 1

      @Cron('* * * * *')
      job(_run: JobRun) {}

      other(value: string) {
        return value
      }
    }
    const scheduler = {} as SchedulerService

    expectTypeOf(scheduler.getJob<typeof TestService>)
      .parameter(1)
      .toEqualTypeOf<'job'>()
    expectTypeOf(scheduler.getJob<typeof TestService>).returns.toEqualTypeOf<
      ScheduledJob | undefined
    >()
  })
})

describe('scheduleTransport', () => {
  it('should be called with and without options', () => {
    expectTypeOf(scheduleTransport).toBeCallableWith()
    expectTypeOf(scheduleTransport).toBeCallableWith({})
    expectTypeOf(scheduleTransport).toBeCallableWith({ enabled: false, timeZone: 'UTC' })
    expectTypeOf<ScheduleTransportOptions>()
      .toHaveProperty('onError')
      .toEqualTypeOf<((error: unknown, run: JobRun) => void | Promise<void>) | undefined>()
  })

  it('should add jobs to the options of @Module', () => {
    class Jobs {}

    Module({ jobs: [Jobs] })
    LegacyModule({ jobs: [Jobs] })
    // @ts-expect-error jobs are classes
    Module({ jobs: ['Jobs'] })
  })
})
