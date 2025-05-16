import { inject, Injectable } from '@navios/core'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cron, Schedulable } from '../decorators/index.mjs'
import { SchedulerService } from '../scheduler.service.mjs'

describe('Schedule Module', () => {
  let schedulerService: SchedulerService

  beforeEach(async () => {
    vi.useFakeTimers()
    schedulerService = await inject(SchedulerService)
  })

  afterEach(() => {
    schedulerService.stopAll()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should register a schedulable service', () => {
    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {}
    }

    expect(() => schedulerService.register(TestService)).not.toThrow()
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job).toBeDefined()
    expect(job?.isActive).toBe(true)
  })

  it('should throw an error when registering a non-schedulable service', () => {
    @Injectable()
    class NonSchedulableService {
      async testJob() {}
    }

    expect(() => schedulerService.register(NonSchedulableService)).toThrow()
  })

  it('should execute a job at the scheduled time', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        mockJob()
      }
    }

    schedulerService.register(TestService)
    expect(mockJob).not.toHaveBeenCalled()

    // Advance time by 1 second to trigger the job
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob).toHaveBeenCalledTimes(1)

    // Advance time by another second to trigger again
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob).toHaveBeenCalledTimes(2)
  })

  it('should not execute jobs when they are stopped', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        mockJob()
      }
    }

    schedulerService.register(TestService)
    schedulerService.stopAll()

    // Advance time but expect no execution
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).not.toHaveBeenCalled()

    // Start jobs and verify they execute
    schedulerService.startAll()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple jobs in a service', async () => {
    const mockJob1 = vi.fn()
    const mockJob2 = vi.fn()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async job1() {
        mockJob1()
      }

      @Cron('*/2 * * * * *')
      async job2() {
        mockJob2()
      }
    }

    schedulerService.register(TestService)

    // After 1 second, only job1 should execute
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob1).toHaveBeenCalledTimes(1)
    expect(mockJob2).not.toHaveBeenCalled()

    // After 2 seconds, both jobs should have executed
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob1).toHaveBeenCalledTimes(2)
    expect(mockJob2).toHaveBeenCalledTimes(1)
  })

  it('should handle disabled jobs', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *', { disabled: true })
      async testJob() {
        mockJob()
      }
    }

    schedulerService.register(TestService)
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job?.isActive).toBe(false)

    // Advance time but expect no execution
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('should handle errors in job execution without crashing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        throw new Error('Test error')
      }
    }

    schedulerService.register(TestService)

    // Job should not throw outside, but log the error
    await vi.advanceTimersByTimeAsync(1000)

    // Should continue executing despite previous error
    await vi.advanceTimersByTimeAsync(1000)

    // Job should still be active
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job?.isActive).toBe(true)

    errorSpy.mockRestore()
  })
})
