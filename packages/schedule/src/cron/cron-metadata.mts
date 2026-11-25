import type { CronJobParams } from 'cron'

export const CronMetadataKey = Symbol('CronMetadataKey')

export interface CronMetadata {
  classMethod: string
  cronTime: CronJobParams['cronTime'] | null
  disabled: boolean
}

export function getAllCronMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<CronMetadata> {
  if (context.metadata) {
    const metadata = context.metadata[CronMetadataKey] as Set<CronMetadata> | undefined
    if (metadata) {
      return metadata
    } else {
      context.metadata[CronMetadataKey] = new Set<CronMetadata>()
      return context.metadata[CronMetadataKey] as Set<CronMetadata>
    }
  }
  throw new Error('[Navios-Schedule] Wrong environment.')
}

export function getCronMetadata(
  target: Function,
  context: ClassMethodDecoratorContext,
): CronMetadata {
  if (context.metadata) {
    const metadata = getAllCronMetadata(context)
    if (metadata) {
      const endpointMetadata = Array.from(metadata).find((item) => item.classMethod === target.name)
      if (endpointMetadata) {
        return endpointMetadata
      } else {
        const newMetadata: CronMetadata = {
          classMethod: target.name,
          cronTime: null,
          disabled: false,
        }
        metadata.add(newMetadata)
        return newMetadata
      }
    }
  }
  throw new Error('[Navios-Schedule] Wrong environment.')
}
