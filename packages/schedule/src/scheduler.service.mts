import type { ClassType } from '@navios/core'

import {
  EnvConfigProvider,
  inject,
  Injectable,
  Logger,
  syncInject,
} from '@navios/core'

import { CronJob } from 'cron'

import type { ScheduleMetadata } from './metadata/index.mjs'

import {
  extractScheduleMetadata,
  hasScheduleMetadata,
} from './metadata/index.mjs'

@Injectable()
export class SchedulerService {
  // private readonly configService = syncInject(EnvConfigProvider)
  private readonly logger = syncInject(Logger, {
    context: SchedulerService.name,
  })
  private readonly jobs: Map<string, CronJob> = new Map()

  register(service: ClassType) {
    if (!hasScheduleMetadata(service)) {
      throw new Error(
        `[Navios-Schedule] Service ${service.name} is not schedulable. Make sure to use @Schedulable decorator.`,
      )
    }
    const metadata = extractScheduleMetadata(service)
    this.logger.debug('Scheduling service', metadata.name)
    this.registerJobs(service, metadata)
  }

  getJob<T extends ClassType>(
    service: T,
    method: keyof InstanceType<T>,
  ): CronJob | undefined {
    const metadata = extractScheduleMetadata(service)
    const jobName = `${metadata.name}.${method as string}()`
    return this.jobs.get(jobName)
  }

  private registerJobs(service: ClassType, metadata: ScheduleMetadata) {
    const jobs = metadata.jobs
    for (const job of jobs) {
      if (!job.cronTime) {
        this.logger.debug('Skipping job', job.classMethod)
        continue
      }
      const name = `${metadata.name}.${job.classMethod}()`
      const self = this
      const defaultDisabled = false
      const cronJob = CronJob.from({
        cronTime: job.cronTime,
        name,
        async onTick() {
          try {
            self.logger.debug('Executing job', name)
            const instance = await inject(service)
            await instance[job.classMethod]()
          } catch (error) {
            self.logger.error('Error executing job', name, error)
          }
        },
        start: !(defaultDisabled || job.disabled),
      })
      this.jobs.set(name, cronJob)
    }
  }

  startAll() {
    for (const job of this.jobs.values()) {
      if (job.isActive) {
        continue
      }
      job.start()
    }
  }

  stopAll() {
    for (const job of this.jobs.values()) {
      if (!job.isActive) {
        continue
      }
      job.stop()
    }
  }
}
