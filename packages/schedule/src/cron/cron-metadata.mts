import { ownMetadata, requireMetadata } from '@navios/core/transport'

import type { OverlapPolicy } from './cron.mjs'

export const CronMetadataKey = Symbol('CronMetadataKey')

export interface CronMetadata {
  classMethod: string
  cronTime: string
  disabled: boolean
  overlap: OverlapPolicy
  timeZone?: string
}

// Jobs a class got from its parent and has not declared itself. `@Cron` on a
// method of the subclass replaces such a job instead of counting as a second
// `@Cron` on the same method.
const inheritedJobs = new WeakSet<CronMetadata>()

/**
 * Copies of a parent's jobs. They are copies so that rescheduling one in a
 * subclass leaves the parent's job as it was.
 */
function inheritCronMetadata(parentJobs: Iterable<CronMetadata>): Set<CronMetadata> {
  const jobs = new Set<CronMetadata>()
  for (const parentJob of parentJobs) {
    const job = { ...parentJob }
    inheritedJobs.add(job)
    jobs.add(job)
  }
  return jobs
}

export function getAllCronMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<CronMetadata> {
  return ownMetadata<Set<CronMetadata>>(requireMetadata(context), CronMetadataKey, (parentJobs) =>
    inheritCronMetadata(parentJobs ?? []),
  )
}

/**
 * Adds the job of a method to its class. It replaces a job the class got
 * from its parent for the same method.
 *
 * @throws when the class itself declares a job for the method already
 */
export function declareCronJob(context: ClassMethodDecoratorContext, job: CronMetadata): void {
  const jobs = getAllCronMetadata(context)
  for (const declared of jobs) {
    if (declared.classMethod !== job.classMethod) {
      continue
    }
    if (!inheritedJobs.delete(declared)) {
      throw new Error(
        `[Navios-Schedule] Method ${job.classMethod} has more than one @Cron. A method can have one schedule.`,
      )
    }
    // In place, so the job keeps its position among those of the class.
    Object.assign(declared, job)
    return
  }
  jobs.add(job)
}
