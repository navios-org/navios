import type { ClassType } from '@navios/core'

import { getAllCronMetadata } from './cron.metadata.mjs'

import type { CronMetadata } from './cron.metadata.mjs'

export const ScheduleMetadataKey = Symbol('ControllerMetadataKey')

export interface ScheduleMetadata {
  name: string
  jobs: Set<CronMetadata>
}

export function getScheduleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ScheduleMetadata {
  if (context.metadata) {
    const metadata = context.metadata[ScheduleMetadataKey] as ScheduleMetadata | undefined
    if (metadata) {
      return metadata
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
      '[Navios-Schedule] Controller metadata not found. Make sure to use @Controller decorator.',
    )
  }
  return metadata
}

export function hasScheduleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ScheduleMetadataKey] as ScheduleMetadata | undefined

  return !!metadata
}
