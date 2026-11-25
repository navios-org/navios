import {
  createApplication,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  Module,
  provide,
} from '@navios/core'
import { fakeTransport } from '@navios/core/testing'
import { defineTransport } from '@navios/core/transport'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Application } from '@navios/core'

import { Cron, Schedulable, scheduleTransport, SchedulerService } from '../index.mjs'

import type { JobRun } from '../index.mjs'

import { createLoggerOutput, deferred } from './logger-output.mjs'

describe('scheduleTransport', () => {
  const logger = createLoggerOutput()
  let app: Application | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
  })

  afterEach(async () => {
    await app?.close()
    app = null
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should run the jobs of modules and of services from start() to close()', async () => {
    const calls: string[] = []

    @Schedulable()
    class FeatureJobs {
      @Cron('*/1 * * * * *')
      job() {
        calls.push('feature')
      }

      @Cron('*/1 * * * * *', { disabled: true })
      disabledJob() {
        calls.push('disabled')
      }
    }
    @Schedulable()
    class ListedJobs {
      @Cron('*/1 * * * * *')
      job() {
        calls.push('listed')
      }
    }
    @Module({ jobs: [FeatureJobs] })
    class FeatureModule {}
    // Listed twice and imported: each class still runs once.
    @Module({ imports: [FeatureModule], jobs: [FeatureJobs] })
    class AppModule {}

    app = createApplication(AppModule, {
      logger,
      transports: [scheduleTransport({ services: [ListedJobs] })],
    })
    await app.init()
    const scheduler = await app.get(SchedulerService)
    const job = scheduler.getJob(FeatureJobs, 'job')
    expect(job?.active).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(calls).toEqual([])
    expect(vi.getTimerCount()).toBe(0)

    await app.start()
    expect(job?.active).toBe(true)
    expect(scheduler.getJob(FeatureJobs, 'disabledJob')?.active).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls.sort()).toEqual(['feature', 'listed'])

    await app.close()
    expect(job?.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should run the classes a module registers itself', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
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

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockJob).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should start a class registered after the application has started', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
        mockJob()
      }
    }
    @Module()
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()
    const scheduler = await app.get(SchedulerService)
    scheduler.register(TestService)
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockJob).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should keep the dependencies of a running job until it has ended', async () => {
    const events: string[] = []
    const gate = deferred()

    @Injectable()
    class Db {
      open = true

      onApplicationShutdown() {
        this.open = false
        events.push('db closed')
      }
    }
    @Schedulable()
    class TestService {
      private readonly db = inject(Db)

      @Cron('*/1 * * * * *')
      async job() {
        await gate.promise
        events.push(`job ended, db open: ${this.db.open}`)
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()
    await vi.advanceTimersByTimeAsync(1000)
    const closing = app.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual([])

    gate.resolve()
    await closing
    expect(events).toEqual(['job ended, db open: true', 'db closed'])
  })

  it('should wait for a hung job for shutdownTimeout at most', async () => {
    let aborted = false

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async hung({ signal }: JobRun) {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise(() => {})
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    app = createApplication(AppModule, {
      logger,
      shutdownTimeout: 1000,
      transports: [scheduleTransport()],
    })
    await app.start()
    await vi.advanceTimersByTimeAsync(1000)
    let closed = false
    void app.close().then(() => {
      closed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(closed).toBe(true)
    expect(logger.warn.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/1000 ms: TestService\.hung\(\)$/),
    ])
  })

  it.each([Infinity, 2 ** 31])(
    'should wait for a job however long with a shutdownTimeout of %d',
    async (shutdownTimeout) => {
      const gate = deferred()
      const events: string[] = []

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        async job() {
          await gate.promise
          events.push('job ended')
        }
      }
      @Module({ jobs: [TestService] })
      class AppModule {}

      app = createApplication(AppModule, {
        logger,
        shutdownTimeout,
        transports: [scheduleTransport()],
      })
      await app.start()
      await vi.advanceTimersByTimeAsync(1000)
      const closing = app.close().then(() => events.push('closed'))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(events).toEqual([])
      gate.resolve()
      await closing

      expect(events).toEqual(['job ended', 'closed'])
      expect(logger.warn).not.toHaveBeenCalled()
    },
  )

  it('should let a job close the application', async () => {
    const events: string[] = []

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      async job() {
        await app!.close()
        events.push('closed')
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(events).toEqual(['closed'])
    expect(vi.getTimerCount()).toBe(0)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should start no run while another transport is still draining', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
        mockJob()
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}
    const slowTransport = defineTransport({
      name: 'slow',
      create: () => ({
        setup() {},
        stop: () => new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      }),
    })

    app = createApplication(AppModule, {
      logger,
      transports: [slowTransport(), scheduleTransport()],
    })
    await app.start()
    void app.close()
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockJob).not.toHaveBeenCalled()
  })

  it('should run nothing before the bootstrap hooks have finished', async () => {
    let ready = false
    const seen: boolean[] = []

    @Injectable()
    class Warmup {
      async onApplicationBootstrap() {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        ready = true
      }
    }
    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
        seen.push(ready)
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {
      readonly warmup = inject(Warmup)
    }

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    void app.start()
    await vi.advanceTimersByTimeAsync(4000)

    expect(seen).toEqual([true, true])
  })

  it('should run nothing when the application fails to initialise', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
        mockJob()
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {
      onApplicationBootstrap() {
        throw new Error('bootstrap failed')
      }
    }

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await expect(app.start()).rejects.toThrow('bootstrap failed')
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockJob).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should stop the jobs when another transport fails to start', async () => {
    const mockJob = vi.fn()

    @Schedulable()
    class TestService {
      @Cron('*/1 * * * * *')
      job() {
        mockJob()
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    app = createApplication(AppModule, {
      logger,
      transports: [
        scheduleTransport(),
        fakeTransport({ kind: 'fake', entry: 'none', log: [], failStart: true }),
      ],
    })
    await expect(app.start()).rejects.toThrow('fake start failed')
    await vi.advanceTimersByTimeAsync(3000)

    expect(mockJob).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should build singleton classes at init, and fail it when one cannot be built', async () => {
    const events: string[] = []

    @Schedulable()
    class GoodJobs {
      constructor() {
        events.push('built')
      }

      @Cron('0 4 * * *')
      job() {}

      onApplicationBootstrap() {
        events.push('bootstrapped')
      }
    }
    @Schedulable({ scope: InjectableScope.Request })
    class RequestJobs {
      constructor() {
        events.push('request-scoped built')
      }

      @Cron('0 4 * * *')
      job() {}
    }
    @Module({ jobs: [GoodJobs, RequestJobs] })
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.init()
    expect(events).toEqual(['built', 'bootstrapped'])
    await app.close()

    @Injectable({ scope: InjectableScope.Request })
    class RequestState {}
    @Schedulable()
    class BadJobs {
      readonly state = inject(RequestState)

      @Cron('0 4 * * *')
      job() {}
    }
    @Module({ jobs: [BadJobs] })
    class BadModule {}

    app = createApplication(BadModule, { logger, transports: [scheduleTransport()] })
    await expect(app.init()).rejects.toThrow(/BadJobs/)
  })

  it('should fail init() with the class and method of an invalid job', async () => {
    @Schedulable()
    class TestService {
      @Cron('not a cron')
      job() {}
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await expect(app.init()).rejects.toThrow(/TestService\.job\(\)/)
  })

  it('should name the module whose jobs hold something else than a class', async () => {
    @Module({ jobs: [undefined as never] })
    class AppModule {}

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await expect(app.init()).rejects.toThrow(/Module AppModule lists undefined in jobs/)
  })

  it('should refuse a second schedule transport', async () => {
    @Module()
    class AppModule {}

    app = createApplication(AppModule, {
      logger,
      transports: [scheduleTransport(), scheduleTransport({}, 'second')],
    })
    await expect(app.init()).rejects.toThrow(/one schedule transport/)
  })

  it('should warn about a class that is built but listed nowhere', async () => {
    @Schedulable()
    class Forgotten {
      @Cron('*/1 * * * * *')
      job() {}
    }
    @Schedulable()
    class Listed {
      @Cron('*/1 * * * * *')
      job() {}
    }
    @Module({ jobs: [Listed] })
    class AppModule {
      readonly forgotten = inject(Forgotten)
      readonly listed = inject(Listed)
    }

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()

    expect(logger.warn.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/Forgotten.*listed nowhere/),
    ])
  })

  it('should start whatever the application has built or was given', async () => {
    const strict = () =>
      new Proxy(
        { PORT: 1 },
        {
          get(target, key) {
            if (typeof key === 'symbol' || key === 'then' || Object.hasOwn(target, key)) {
              return Reflect.get(target, key)
            }
            throw new Error(`${key} is not declared`)
          },
        },
      )
    const hostile = () =>
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('has no prototype')
          },
        },
      )
    const remote = () => new Proxy(() => {}, { get: (_target, key) => key !== 'then' && remote })
    const token = (name: string) => InjectionToken.create<unknown>(name)
    const tokens = ['a', 'b', 'c', 'd', 'e', 'f'].map(token)
    const [a, b, c, d, e, f] = tokens

    @Schedulable()
    class Forgotten {
      @Cron('*/1 * * * * *')
      job() {}
    }
    @Module({
      providers: [
        provide(a, { value: strict() }),
        provide(b, { factory: strict }),
        provide(c, { factory: hostile }),
        provide(d, { factory: remote }),
        provide(e, { factory: () => Object.create(null) as unknown }),
        provide(f, { value: new Forgotten() }),
      ],
    })
    class AppModule {
      readonly all = tokens.map((each) => inject(each))
      readonly forgotten = inject(Forgotten)
    }

    app = createApplication(AppModule, { logger, transports: [scheduleTransport()] })
    await app.start()

    expect(logger.warn.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/Forgotten.*listed nowhere/),
    ])
  })

  it('should keep two applications in one process apart', async () => {
    const calls: string[] = []

    @Injectable()
    class Tag {
      name = ''
    }
    @Schedulable()
    class TestService {
      private readonly tag = inject(Tag)

      @Cron('*/1 * * * * *')
      job() {
        calls.push(this.tag.name)
      }
    }
    @Module({ jobs: [TestService] })
    class AppModule {}

    const create = async (name: string) => {
      const application = createApplication(AppModule, {
        logger,
        transports: [scheduleTransport()],
      })
      ;(await application.get(Tag)).name = name
      return application.start()
    }
    const first = await create('first')
    app = await create('second')
    await vi.advanceTimersByTimeAsync(1000)
    await first.close()
    await vi.advanceTimersByTimeAsync(1000)

    expect(calls).toEqual(['first', 'second', 'second'])
  })

  describe('options', () => {
    it('enabled: false should register and build the jobs and start none', async () => {
      const mockJob = vi.fn()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        job() {
          mockJob()
        }
      }
      @Schedulable()
      class LateService {
        @Cron('*/1 * * * * *')
        job() {
          mockJob()
        }
      }
      @Module({ jobs: [TestService] })
      class AppModule {}

      app = createApplication(AppModule, {
        logger,
        transports: [scheduleTransport({ enabled: false })],
      })
      await app.start()
      const scheduler = await app.get(SchedulerService)
      scheduler.register(LateService)
      await vi.advanceTimersByTimeAsync(3000)
      expect(mockJob).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      await scheduler.getJob(TestService, 'job')!.run()
      expect(mockJob).toHaveBeenCalledTimes(1)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('timeZone should be the default of every job', async () => {
      @Schedulable()
      class TestService {
        @Cron('0 4 * * *')
        tokyo() {}

        @Cron('0 4 * * *', { timeZone: 'UTC' })
        utc() {}
      }
      @Module()
      class AppModule {
        private readonly scheduler = inject(SchedulerService)

        // Before the transport is set up.
        onModuleInit() {
          this.scheduler.register(TestService)
        }
      }

      app = createApplication(AppModule, {
        logger,
        transports: [scheduleTransport({ timeZone: 'Asia/Tokyo' })],
      })
      await app.start()
      const scheduler = await app.get(SchedulerService)

      // 04:00 in Tokyo is 19:00 UTC.
      expect(scheduler.getJob(TestService, 'tokyo')?.nextRun).toEqual(
        new Date('2021-01-01T19:00:00.000Z'),
      )
      expect(scheduler.getJob(TestService, 'utc')?.nextRun).toEqual(
        new Date('2021-01-01T04:00:00.000Z'),
      )
    })

    it('timeZone should not be empty', async () => {
      @Schedulable()
      class TestService {
        @Cron('0 4 * * *')
        job() {}
      }
      @Module({ jobs: [TestService] })
      class AppModule {}

      app = createApplication(AppModule, {
        logger,
        transports: [scheduleTransport({ timeZone: '' })],
      })
      await expect(app.init()).rejects.toThrow(/TestService\.job\(\): the time zone is empty/)
    })

    it('onError should receive the error of a failed run after it was logged', async () => {
      const failure = new Error('failed')
      const reported: unknown[] = []

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        job() {
          throw failure
        }
      }
      @Module({ jobs: [TestService] })
      class AppModule {}

      app = createApplication(AppModule, {
        logger,
        transports: [
          scheduleTransport({
            onError: (error, { name, scheduledAt }) => {
              reported.push([error, name, scheduledAt, logger.error.mock.calls.length])
            },
          }),
        ],
      })
      await app.start()
      await vi.advanceTimersByTimeAsync(1000)
      const scheduler = await app.get(SchedulerService)
      await expect(scheduler.getJob(TestService, 'job')!.run()).rejects.toBe(failure)

      expect(reported).toEqual([
        [failure, 'TestService.job()', new Date('2021-01-01T00:00:01.000Z'), 1],
      ])
    })

    it('onError should be waited for, and may fail without stopping the job', async () => {
      const gate = deferred()

      @Schedulable()
      class TestService {
        @Cron('*/1 * * * * *')
        job() {
          throw new Error('failed')
        }
      }
      @Module({ jobs: [TestService] })
      class AppModule {}

      app = createApplication(AppModule, {
        logger,
        transports: [scheduleTransport({ onError: () => gate.promise })],
      })
      await app.start()
      await vi.advanceTimersByTimeAsync(1000)
      const scheduler = await app.get(SchedulerService)
      const job = scheduler.getJob(TestService, 'job')!
      expect(job.running).toBe(true)

      gate.reject(new Error('reporting failed'))
      await vi.advanceTimersByTimeAsync(0)
      expect(job.running).toBe(false)
      expect(job.active).toBe(true)
      expect(logger.error.mock.calls.map((call) => call[0])).toEqual([
        'Job TestService.job() failed',
        'Reporting the error of job TestService.job() failed',
      ])
    })
  })
})
