import type { ClassType } from '@navios/core'

import { getAllCronMetadata } from '../cron/cron-metadata.mjs'

import type { CronMetadata } from '../cron/cron-metadata.mjs'

export const ScheduleMetadataKey = Symbol('ScheduleMetadataKey')

export interface ScheduleMetadata {
  name: string
  jobs: Set<CronMetadata>
}

export function defineScheduleMetadata(target: ClassType, context: ClassDecoratorContext): void {
  const metadata: ScheduleMetadata = {
    name: target.name,
    jobs: getAllCronMetadata(context),
  }
  Object.defineProperty(target, ScheduleMetadataKey, { value: metadata, configurable: true })
}

export function extractScheduleMetadata(target: ClassType): ScheduleMetadata {
  const metadata = ownMetadata(target)
  if (!metadata) {
    throw new Error(
      `[Navios-Schedule] Schedule metadata not found on ${target.name}. Make sure to use the @Schedulable decorator.`,
    )
  }
  return metadata
}

export function hasScheduleMetadata(target: ClassType): boolean {
  return ownMetadata(target) !== undefined
}

/**
 * Only an own property counts: a subclass without the decorator inherits the
 * static members of its parent, and is not schedulable itself.
 */
function ownMetadata(target: ClassType): ScheduleMetadata | undefined {
  return Object.hasOwn(target, ScheduleMetadataKey)
    ? (target as unknown as Record<symbol, ScheduleMetadata>)[ScheduleMetadataKey]
    : undefined
}
