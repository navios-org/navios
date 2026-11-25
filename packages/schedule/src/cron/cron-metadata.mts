import type { OverlapPolicy } from './cron.mjs'

export const CronMetadataKey = Symbol('CronMetadataKey')

export interface CronMetadata {
  classMethod: string
  cronTime: string | null
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
  const { metadata } = context
  if (!metadata) {
    throw new Error(
      '[Navios-Schedule] This environment does not provide decorator metadata, so jobs cannot be declared.',
    )
  }
  // The metadata object of a subclass inherits from the one of its parent,
  // so only an own property is the set of this class.
  if (Object.hasOwn(metadata, CronMetadataKey)) {
    return metadata[CronMetadataKey] as Set<CronMetadata>
  }
  const parentJobs = metadata[CronMetadataKey] as Set<CronMetadata> | undefined
  const jobs = inheritCronMetadata(parentJobs ?? [])
  metadata[CronMetadataKey] = jobs
  return jobs
}

export function getCronMetadata(context: ClassMethodDecoratorContext): CronMetadata {
  const jobs = getAllCronMetadata(context)
  // Not the name of the function: a decorator applied before this one may have
  // replaced the method with a function of another name.
  const classMethod = String(context.name)
  for (const job of jobs) {
    if (job.classMethod === classMethod) {
      return job
    }
  }
  const job: CronMetadata = { classMethod, cronTime: null, disabled: false, overlap: 'skip' }
  jobs.add(job)
  return job
}
