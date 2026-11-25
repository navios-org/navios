import { createApplication, inject, Module } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Application } from '@navios/core'

import { Cron, Schedulable, schedulePlugin, SchedulerService } from '../index.mjs'

// The application has no transport at all: scheduled work needs none.
describe('Schedule in a Navios application', () => {
  let app: Application | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
  })

  afterEach(async () => {
    await app?.close()
    app = null
    vi.useRealTimers()
  })

  it('should start jobs registered in onModuleInit at bootstrap and stop them on close', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        mockJob()
      }
    }

    @Module()
    class AppModule {
      private readonly scheduler = inject(SchedulerService)

      onModuleInit() {
        this.scheduler.register(TestService)
      }
    }

    app = createApplication(AppModule, {
      logger: false,
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).not.toHaveBeenCalled()

    await app.init()
    const scheduler = await app.get(SchedulerService)
    const job = scheduler.getJob(TestService, 'testJob')
    expect(job?.isActive).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockJob).toHaveBeenCalledTimes(2)

    await app.close()
    expect(job?.isActive).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).toHaveBeenCalledTimes(2)
  })

  it('should let close() wait for a run in progress', async () => {
    let finish!: () => void
    const finished = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        finished()
      }
    }

    @Module()
    class AppModule {}

    app = createApplication(AppModule, {
      logger: false,
      plugins: [schedulePlugin({ services: [TestService] })],
    })
    await app.init()
    await vi.advanceTimersByTimeAsync(1000)

    let closed = false
    const closing = app.close().then(() => {
      closed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(closed).toBe(false)

    finish()
    await closing
    expect(finished).toHaveBeenCalledTimes(1)
  })

  it('should register, start and stop the services given to schedulePlugin', async () => {
    const mockJob = vi.fn()
    const disabledJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        mockJob()
      }

      @Cron('*/1 * * * * *', { disabled: true })
      async disabledJob() {
        disabledJob()
      }
    }

    @Module()
    class AppModule {}

    app = createApplication(AppModule, {
      logger: false,
      plugins: [schedulePlugin({ services: [TestService] })],
    })
    await app.init()

    const scheduler = await app.get(SchedulerService)
    expect(scheduler.getJob(TestService, 'testJob')?.isActive).toBe(true)
    expect(scheduler.getJob(TestService, 'disabledJob')?.isActive).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob).toHaveBeenCalledTimes(1)

    await app.close()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).toHaveBeenCalledTimes(1)
    expect(disabledJob).not.toHaveBeenCalled()
  })
})
