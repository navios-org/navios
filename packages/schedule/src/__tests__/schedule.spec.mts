import { Container, Injectable, InjectableScope, inject, LoggerOutput } from '@navios/core'
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

describe('Schedule Module', () => {
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
    vi.clearAllMocks()
  })

  it('should register a schedulable service', () => {
    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {}
    }

    expect(() => schedulerService.register(TestService)).not.toThrow()
    schedulerService.start()
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job).toBeDefined()
    expect(job?.active).toBe(true)
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
    schedulerService.start()
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
    schedulerService.start()
    await schedulerService.stop()

    // Advance time but expect no execution
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).not.toHaveBeenCalled()

    // Start jobs and verify they execute
    schedulerService.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockJob).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple jobs in a service', async () => {
    const mockJob1 = vi.fn()
    const mockJob2 = vi.fn()

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
    schedulerService.start()

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
    schedulerService.start()
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job?.active).toBe(false)

    // Advance time but expect no execution
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockJob).not.toHaveBeenCalled()

    // Pausing and resuming the scheduler does not start it either
    await schedulerService.stop()
    schedulerService.start()
    expect(job?.active).toBe(false)
  })

  it('should handle errors in job execution without crashing', async () => {
    const failure = new Error('Test error')

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async testJob() {
        throw failure
      }
    }

    schedulerService.register(TestService)
    schedulerService.start()

    // Job should not throw outside, but log the error
    await vi.advanceTimersByTimeAsync(1000)
    expect(loggerOutput.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(loggerOutput.error.mock.calls[0])).toContain('TestService.testJob()')

    // Should continue executing despite previous error
    await vi.advanceTimersByTimeAsync(1000)
    expect(loggerOutput.error).toHaveBeenCalledTimes(2)

    // Job should still be active
    const job = schedulerService.getJob(TestService, 'testJob')
    expect(job?.active).toBe(true)
  })

  describe('lifecycle', () => {
    it('should not start jobs before the scheduler is started', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          mockJob()
        }
      }

      schedulerService.register(TestService)
      expect(schedulerService.getJob(TestService, 'testJob')?.active).toBe(false)

      await vi.advanceTimersByTimeAsync(3000)
      expect(mockJob).not.toHaveBeenCalled()
    })

    it('should start a service registered after the scheduler started', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          mockJob()
        }
      }

      schedulerService.start()
      schedulerService.register(TestService)

      await vi.advanceTimersByTimeAsync(1000)
      expect(mockJob).toHaveBeenCalledTimes(1)
    })

    it('should wait for a run in progress when stopping', async () => {
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

      schedulerService.register(TestService)
      schedulerService.start()
      await vi.advanceTimersByTimeAsync(1000)

      let stopped = false
      const stopping = schedulerService.stop().then(() => {
        stopped = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(stopped).toBe(false)

      finish()
      await stopping
      expect(finished).toHaveBeenCalledTimes(1)
    })

    it('should stop the jobs when the container is disposed', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          mockJob()
        }
      }

      const local = new Container()
      local.addInstance(LoggerOutput, loggerOutput)
      const scheduler = await local.get(SchedulerService)
      scheduler.register(TestService)
      scheduler.start()

      await local.dispose()

      expect(scheduler.getJob(TestService, 'testJob')?.active).toBe(false)
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockJob).not.toHaveBeenCalled()
    })

    it('should ignore a second registration of the same service', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          mockJob()
        }
      }

      schedulerService.register(TestService)
      const job = schedulerService.getJob(TestService, 'testJob')
      schedulerService.register(TestService)
      schedulerService.start()

      expect(schedulerService.getJob(TestService, 'testJob')).toBe(job)
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockJob).toHaveBeenCalledTimes(1)
    })
  })

  describe('per-run DI scope', () => {
    it('should reuse a singleton schedulable service between runs', async () => {
      const instances = new Set<object>()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          instances.add(this)
        }
      }

      schedulerService.register(TestService)
      schedulerService.start()
      await vi.advanceTimersByTimeAsync(2000)

      expect(instances.size).toBe(1)
      expect(instances.has(await container.get(TestService))).toBe(true)
    })

    it('should create a request-scoped schedulable service for each run and destroy it after', async () => {
      const events: string[] = []
      let next = 0

      @Schedulable({ scope: InjectableScope.Request })
      class TestService {
        private readonly id = ++next

        @Cron('*/1 * * * * *')
        async testJob() {
          events.push(`run ${this.id}`)
        }

        onServiceDestroy() {
          events.push(`destroy ${this.id}`)
        }
      }

      schedulerService.register(TestService)
      schedulerService.start()
      await vi.advanceTimersByTimeAsync(2000)

      expect(events).toEqual(['run 1', 'destroy 1', 'run 2', 'destroy 2'])
    })

    it('should give request-scoped dependencies to one run only', async () => {
      const seen: object[] = []
      const destroyed = vi.fn()

      @Injectable({ scope: InjectableScope.Request })
      class RunState {
        onServiceDestroy() {
          destroyed()
        }
      }

      @Injectable()
      class SharedService {}

      @Schedulable({ scope: InjectableScope.Request })
      class TestService {
        private readonly state = inject(RunState)
        private readonly shared = inject(SharedService)

        @Cron('*/1 * * * * *')
        async testJob() {
          seen.push(this.state, this.shared)
        }
      }

      schedulerService.register(TestService)
      schedulerService.start()
      await vi.advanceTimersByTimeAsync(2000)

      expect(seen).toHaveLength(4)
      expect(seen[0]).not.toBe(seen[2])
      expect(seen[1]).toBe(seen[3])
      expect(destroyed).toHaveBeenCalledTimes(2)
    })

    it('should dispose the scope of a run that failed', async () => {
      const destroyed = vi.fn()

      @Schedulable({ scope: InjectableScope.Request })
      class TestService {
        @Cron('*/1 * * * * *')
        async testJob() {
          throw new Error('Test error')
        }

        onServiceDestroy() {
          destroyed()
        }
      }

      schedulerService.register(TestService)
      schedulerService.start()
      await vi.advanceTimersByTimeAsync(1000)

      expect(destroyed).toHaveBeenCalledTimes(1)
      expect(loggerOutput.error).toHaveBeenCalledTimes(1)
    })
  })
})
