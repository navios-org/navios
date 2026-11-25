import type { CronJobParams } from 'cron'

export const CronMetadataKey = Symbol('CronMetadataKey')

export interface CronMetadata {
  classMethod: string
  cronTime: CronJobParams['cronTime'] | null
  disabled: boolean
  timeZone?: string
}

// Jobs a class got from its parent and has not declared itself. `@Cron` on a
// method of the subclass replaces such a job instead of counting as a second
// `@Cron` on the same method.
const inheritedJobs = new WeakSet<CronMetadata>()

/**
 * Adds copies of the given jobs to a set, skipping the methods the set already
 * has. They are copies so that rescheduling one in a subclass leaves the
 * parent's job as it was.
 */
export function inheritCronMetadata(jobs: Set<CronMetadata>, parentJobs: Iterable<CronMetadata>) {
  const known = new Set(Array.from(jobs, (job) => job.classMethod))
  for (const parentJob of parentJobs) {
    if (known.has(parentJob.classMethod)) {
      continue
    }
    const job = { ...parentJob }
    inheritedJobs.add(job)
    jobs.add(job)
  }
}

/**
 * Whether the job was copied from a parent class and is not declared by the
 * class itself. Marks it as declared, so the answer is `true` only once.
 */
export function takeInheritedCronMetadata(job: CronMetadata): boolean {
  return inheritedJobs.delete(job)
}

export function getAllCronMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<CronMetadata> {
  if (context.metadata) {
    // The metadata object of a subclass inherits from the one of its parent,
    // so only an own property is the set of this class.
    if (Object.hasOwn(context.metadata, CronMetadataKey)) {
      return context.metadata[CronMetadataKey] as Set<CronMetadata>
    }
    const parentJobs = context.metadata[CronMetadataKey] as Set<CronMetadata> | undefined
    const jobs = new Set<CronMetadata>()
    if (parentJobs) {
      inheritCronMetadata(jobs, parentJobs)
    }
    context.metadata[CronMetadataKey] = jobs
    return jobs
  }
  throw new Error('[Navios-Schedule] Wrong environment.')
}

export function getCronMetadata(
  _target: Function,
  context: ClassMethodDecoratorContext,
): CronMetadata {
  if (context.metadata) {
    const metadata = getAllCronMetadata(context)
    // Not `target.name`: a decorator applied before this one may have replaced
    // the method with a function of another name.
    const classMethod = String(context.name)
    const endpointMetadata = Array.from(metadata).find((item) => item.classMethod === classMethod)
    if (endpointMetadata) {
      return endpointMetadata
    } else {
      const newMetadata: CronMetadata = {
        classMethod,
        cronTime: null,
        disabled: false,
      }
      metadata.add(newMetadata)
      return newMetadata
    }
  }
  throw new Error('[Navios-Schedule] Wrong environment.')
}
