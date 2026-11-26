import { classMetadata } from '@navios/core/transport'

import type { ClassType } from '@navios/core'

import { getAllCronMetadata } from '../cron/cron-metadata.mjs'

import type { CronMetadata } from '../cron/cron-metadata.mjs'

export interface ScheduleMetadata {
  name: string
  jobs: Set<CronMetadata>
}

// Only what the class itself carries counts: a subclass without the decorator
// inherits the static members of its parent, and is not schedulable itself.
const scheduleMetadata = classMetadata<ScheduleMetadata>(
  Symbol('ScheduleMetadataKey'),
  'schedulable',
  'Schedulable',
)

export function defineScheduleMetadata(target: ClassType, context: ClassDecoratorContext): void {
  scheduleMetadata.define(target, { name: target.name, jobs: getAllCronMetadata(context) })
}

export function extractScheduleMetadata(target: ClassType): ScheduleMetadata {
  return scheduleMetadata.get(target)
}

export function hasScheduleMetadata(target: ClassType): boolean {
  return scheduleMetadata.has(target)
}
