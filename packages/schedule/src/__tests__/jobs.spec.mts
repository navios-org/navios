import { AsyncLocalStorage } from 'node:async_hooks'

import {
  Container,
  createApplication,
  inject,
  InjectableScope,
  LoggerOutput,
  Module,
} from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Cron, Schedulable, scheduleTransport, SchedulerService } from '../index.mjs'

import type { JobRun, ScheduledJob } from '../index.mjs'

import { createLoggerOutput, deferred } from './logger-output.mjs'

describe('jobs', () => {
  const loggerOutput = createLoggerOutput()
  let container: Container
  let scheduler: SchedulerService

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
    container = new Container()
    container.addInstance(LoggerOutput, loggerOutput)
    scheduler = await container.get(SchedulerService)
    scheduler.start()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await container.dispose()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const at = (seconds: number) => new Date(Date.UTC(2021, 0, 1) + seconds * 1000)

  describe('the argument of a job', () => {
    it('should hold the name, the scheduled time and a signal', async () => {
      const runs: JobRun[] = []

      @Schedulable()
      class TestService {
        @Cron('*/2 * * * * *')
        job(run: JobRun) {
          runs.push(run)
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(4000)
      await scheduler.getJob(TestService, 'job')!.run()

      expect(runs.map((run) => run.name)).toEqual(Array(3).fill('TestService.job()'))
      expect(runs.map((run) => run.scheduledAt)).toEqual([at(2), at(4), null])
      expect(runs.map((run) => run.signal.aborted)).toEqual([false, false, false])
      expect(new Set(runs.map((run) => run.signal)).size).toBe(3)
    })

    it('should hold the time of the schedule when the tick is late', async () => {
      const runs: JobRun[] = []

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        job(run: JobRun) {
          runs.push(run)
        }
      }

      scheduler.register(TestService)
      vi.setSystemTime(at(3.5))
      await vi.advanceTimersByTimeAsync(1000)

      expect(runs.map((run) => run.scheduledAt)).toEqual([at(1)])
    })
  })

  describe('the handle of a job', () => {
    it('should tell the state of the job', async () => {
      const gate = deferred()

      @Schedulable()
      class TestService {
        @Cron('*/5 * * * * *')
        async job() {
          await gate.promise
        }
      }

      scheduler.register(TestService)
      const job = scheduler.getJob(TestService, 'job')!
      const state = ({ name, active, running, nextRun, lastRun }: ScheduledJob) => ({
        name,
        active,
        running,
        nextRun,
        lastRun,
      })
      const name = 'TestService.job()'
      expect(state(job)).toEqual({
        name,
        active: true,
        running: false,
        nextRun: at(5),
        lastRun: null,
      })

      await vi.advanceTimersByTimeAsync(6000)
      expect(state(job)).toEqual({
        name,
        active: true,
        running: true,
        nextRun: at(10),
        lastRun: at(5),
      })

      job.stop()
      gate.resolve()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(state(job)).toEqual({
        name,
        active: false,
        running: false,
        nextRun: null,
        lastRun: at(5),
      })

      job.start()
      expect(job.nextRun).toEqual(at(20))
    })

    it('should run a disabled job by hand and leave it off its schedule', async () => {
      const gate = deferred()
      let finished = false

      @Schedulable()
      class TestService {
        @Cron('0 4 * * *', { disabled: true })
        async job() {
          await gate.promise
          finished = true
        }
      }

      scheduler.register(TestService)
      const job = scheduler.getJob(TestService, 'job')!
      const run = job.run().then(() => finished)
      expect(job.running).toBe(true)
      gate.resolve()

      expect(await run).toBe(true)
      expect(job.running).toBe(false)
      expect(job.active).toBe(false)
      expect(job.lastRun).toEqual(at(0))
    })

    it('should reject run() with the error of the run, without logging it', async () => {
      const failure = new Error('failed')

      @Schedulable()
      class TestService {
        @Cron('0 4 * * *')
        job() {
          throw failure
        }
      }

      scheduler.register(TestService)

      await expect(scheduler.getJob(TestService, 'job')!.run()).rejects.toBe(failure)
      expect(loggerOutput.error).not.toHaveBeenCalled()
    })

    it('should give a manual run its own DI scope', async () => {
      const events: string[] = []

      @Schedulable({ scope: InjectableScope.Request })
      class TestService {
        @Cron('0 4 * * *')
        job() {
          events.push('run')
        }

        onServiceDestroy() {
          events.push('destroy')
        }
      }

      scheduler.register(TestService)
      await scheduler.getJob(TestService, 'job')!.run()

      expect(events).toEqual(['run', 'destroy'])
    })

    it('should not exist for a method that is not a job', () => {
      @Schedulable()
      class TestService {
        @Cron('0 4 * * *')
        job() {}

        other() {}
      }

      scheduler.register(TestService)

      expect(scheduler.getJob(TestService, 'other')).toBeUndefined()
    })

    it('should refuse to run or start once the container is disposed', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        job() {
          mockJob()
        }
      }
      @Schedulable()
      class LateService {
        @Cron('* * * * * *')
        job() {}
      }

      scheduler.register(TestService)
      const job = scheduler.getJob(TestService, 'job')!
      await container.dispose()

      expect(() => job.start()).toThrow(/disposed/)
      await expect(job.run()).rejects.toThrow(/disposed/)
      expect(() => scheduler.start()).toThrow(/disposed/)
      expect(() => scheduler.register(LateService)).toThrow(/disposed/)
      expect(vi.getTimerCount()).toBe(0)
      expect(mockJob).not.toHaveBeenCalled()
    })
  })

  describe('overlap', () => {
    it('should skip the ticks of a job that is still running and warn once per streak', async () => {
      let gate = deferred()
      const scheduled: Array<Date | null> = []

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job({ scheduledAt }: JobRun) {
          scheduled.push(scheduledAt)
          await gate.promise
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(4000)
      expect(scheduled).toEqual([at(1)])
      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn.mock.calls[0][0]).toContain('TestService.job()')

      gate.resolve()
      gate = deferred()
      await vi.advanceTimersByTimeAsync(3000)
      expect(scheduled).toEqual([at(1), at(5)])
      expect(loggerOutput.warn).toHaveBeenCalledTimes(2)
      gate.resolve()
    })

    it('should let runs overlap with overlap: allow', async () => {
      const gate = deferred()
      let running = 0

      @Schedulable()
      class TestService {
        @Cron('* * * * * *', { overlap: 'allow' })
        async job() {
          running++
          await gate.promise
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(3000)
      const manual = scheduler.getJob(TestService, 'job')!.run()
      await vi.advanceTimersByTimeAsync(0)

      expect(running).toBe(4)
      expect(loggerOutput.warn).not.toHaveBeenCalled()
      gate.resolve()
      await manual
    })

    it('should reject a manual run while the job is running, and skip a tick during one', async () => {
      const gate = deferred()
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job() {
          mockJob()
          await gate.promise
        }
      }

      scheduler.register(TestService)
      const job = scheduler.getJob(TestService, 'job')!
      const manual = job.run()
      await expect(job.run()).rejects.toThrow(/TestService\.job\(\) is already running/)
      await vi.advanceTimersByTimeAsync(2000)
      expect(mockJob).toHaveBeenCalledTimes(1)

      gate.resolve()
      await manual
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockJob).toHaveBeenCalledTimes(2)
    })

    it('should not count the runs of another job of the class', async () => {
      const gate = deferred()
      const other = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job() {
          await gate.promise
        }

        @Cron('* * * * * *')
        other() {
          other()
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(3000)
      expect(other).toHaveBeenCalledTimes(3)
      gate.resolve()
    })
  })

  describe('stop()', () => {
    it('should abort the signal of the runs in progress', async () => {
      const reasons: unknown[] = []

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job({ signal }: JobRun) {
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
              reasons.push(signal.reason.name)
              resolve()
            })
          })
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      await scheduler.stop()

      expect(reasons).toEqual(['AbortError'])
      expect(loggerOutput.warn).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('should wait at most the given time and log what is still running', async () => {
      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async hung() {
          await new Promise(() => {})
        }

        @Cron('* * * * * *')
        async quick() {}
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      let stopped = false
      const stopping = scheduler.stop(500).then(() => {
        stopped = true
      })
      await vi.advanceTimersByTimeAsync(499)
      expect(stopped).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await stopping

      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn.mock.calls[0][0]).toMatch(/500 ms: TestService\.hung\(\)$/)

      // Disposing the container does not wait for that run a second time.
      await container.dispose()
      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
    })

    it('should wait for the runs in progress when only the container is disposed', async () => {
      const gate = deferred()
      const finished = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job() {
          await gate.promise
          finished()
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      const disposing = container.dispose()
      await vi.advanceTimersByTimeAsync(0)
      gate.resolve()
      await disposing

      expect(finished).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn).not.toHaveBeenCalled()
    })

    it('should not wait for the run that calls it', async () => {
      const events: string[] = []
      const gate = deferred()

      @Schedulable()
      class TestService {
        private readonly scheduler = inject(SchedulerService)

        @Cron('*/2 * * * * *')
        async stopper() {
          await this.scheduler.stop()
          events.push('stopped')
        }

        @Cron('* * * * * *')
        async other() {
          await gate.promise
          events.push('other ended')
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(2000)
      expect(events).toEqual([])
      gate.resolve()
      await vi.advanceTimersByTimeAsync(0)

      expect(events).toEqual(['other ended', 'stopped'])
      expect(loggerOutput.warn).not.toHaveBeenCalled()
    })

    it('should let a job dispose the container', async () => {
      @Schedulable()
      class TestService {
        private readonly container = inject(Container)

        @Cron('* * * * * *')
        async job() {
          await this.container.dispose()
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      await container.dispose()

      expect(loggerOutput.warn).not.toHaveBeenCalled()
      expect(loggerOutput.error).not.toHaveBeenCalled()
    })

    it('should resolve when the scheduler is started again before the runs have ended', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job() {
          mockJob()
          await new Promise((resolve) => setTimeout(resolve, 900))
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1100)
      let stopped = false
      void scheduler.stop().then(() => {
        stopped = true
      })
      scheduler.start()
      await vi.advanceTimersByTimeAsync(2000)

      expect(stopped).toBe(true)
      expect(mockJob).toHaveBeenCalledTimes(3)
      void scheduler.stop()
      await vi.advanceTimersByTimeAsync(1000)
    })
  })

  describe('a failed run', () => {
    it('should be one log record', async () => {
      const failure = new Error('failed')

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        job() {
          throw failure
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)

      expect(loggerOutput.error).toHaveBeenCalledExactlyOnceWith(
        'Job TestService.job() failed',
        failure,
        'SchedulerService',
      )
    })

    it('should reach onError and nothing else when the logger fails as well', async () => {
      const unhandled = vi.fn()
      process.on('unhandledRejection', unhandled)
      const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
      const broken = () => {
        throw new Error('log transport closed')
      }
      const failure = new Error('failed')
      const onError = vi.fn(() => {
        throw new Error('cannot report')
      })
      const gate = deferred()
      const ran = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        job() {
          throw failure
        }

        @Cron('* * * * * *')
        async slow() {
          ran()
          await gate.promise
        }
      }
      @Module({ jobs: [TestService] })
      class AppModule {}
      const app = createApplication(AppModule, {
        logger: { log() {}, warn: broken, error: broken, debug: broken },
        transports: [scheduleTransport({ onError })],
      })
      try {
        await app.start()
        await vi.advanceTimersByTimeAsync(2000)

        expect(ran).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(2)
        expect(printed.mock.calls.flat()).toContain(failure)
        vi.useRealTimers()
        await new Promise((resolve) => setImmediate(resolve))
        expect(unhandled).not.toHaveBeenCalled()
      } finally {
        gate.resolve()
        await app.close()
        process.off('unhandledRejection', unhandled)
      }
    })

    it('should not be an error when the job stopped because its signal was aborted', async () => {
      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job({ signal }: JobRun) {
          await new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason))
          })
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      await scheduler.stop()

      expect(loggerOutput.error).not.toHaveBeenCalled()
      expect(loggerOutput.warn).toHaveBeenCalledTimes(1)
      expect(loggerOutput.warn.mock.calls[0][0]).toContain('TestService.job() was interrupted')
    })

    it('should be logged when it fails during a shutdown for another reason', async () => {
      const gate = deferred()

      @Schedulable()
      class TestService {
        @Cron('* * * * * *')
        async job() {
          await gate.promise
        }
      }

      scheduler.register(TestService)
      await vi.advanceTimersByTimeAsync(1000)
      const stopping = scheduler.stop()
      gate.reject(new Error('late failure'))
      await stopping

      expect(loggerOutput.error).toHaveBeenCalledTimes(1)
    })
  })

  // Only the clock is faked: a faked timer runs in the async context of the
  // test, not in the one it was created in.
  describe('async context', () => {
    it('should not be inherited from whoever starts or runs a job', async () => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(at(0.99))
      const storage = new AsyncLocalStorage<string>()
      const seen: unknown[] = []
      const armedIn: unknown[] = []
      const { setTimeout: realSetTimeout } = globalThis
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
        armedIn.push(storage.getStore())
        return realSetTimeout(callback, delay)
      })
      const runs = async (count: number) => {
        while (seen.length < count) {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
      }

      @Schedulable()
      class TestService {
        @Cron('* * * * * *', { disabled: true })
        job({ scheduledAt }: JobRun) {
          seen.push([scheduledAt, storage.getStore()])
          // The next tick is 10 ms away again.
          vi.setSystemTime(at(1.99))
        }
      }

      scheduler.register(TestService)
      const job = scheduler.getJob(TestService, 'job')!
      await storage.run('request', async () => {
        await job.run()
        vi.setSystemTime(at(0.99))
        job.start()
        vi.setSystemTime(at(1.99))
      })
      await runs(2)
      vi.setSystemTime(at(2))
      await runs(3)
      job.stop()

      expect(seen).toEqual([
        [null, undefined],
        [at(1), undefined],
        [at(2), undefined],
      ])
      // A timer armed in the context would keep it in memory.
      expect(new Set(armedIn)).toEqual(new Set([undefined]))
    })
  })
})
