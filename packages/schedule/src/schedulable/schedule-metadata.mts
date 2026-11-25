import type { ClassType } from '@navios/core'

import { getAllCronMetadata } from '../cron/cron-metadata.mjs'

import type { CronMetadata } from '../cron/cron-metadata.mjs'

export const ScheduleMetadataKey = Symbol('ScheduleMetadataKey')

export interface ScheduleMetadata {
  name: string
  jobs: Set<CronMetadata>
}

export function getScheduleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ScheduleMetadata {
  if (context.metadata) {
    // The metadata object of a subclass inherits from the one of its parent,
    // so only an own property is the metadata of this class.
    if (Object.hasOwn(context.metadata, ScheduleMetadataKey)) {
      return context.metadata[ScheduleMetadataKey] as ScheduleMetadata
    } else {
      const jobsMetadata = getAllCronMetadata(context)
      const newMetadata: ScheduleMetadata = {
        name: target.name,
        jobs: jobsMetadata,
      }
      context.metadata[ScheduleMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[ScheduleMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios-Schedule] Wrong environment.')
}

export function extractScheduleMetadata(target: ClassType): ScheduleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ScheduleMetadataKey] as ScheduleMetadata | undefined
  if (!metadata) {
    throw new Error(
      `[Navios-Schedule] Schedule metadata not found on ${target.name}. Make sure to use the @Schedulable decorator.`,
    )
  }
  return metadata
}

export function hasScheduleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ScheduleMetadataKey] as ScheduleMetadata | undefined

  return !!metadata
}
