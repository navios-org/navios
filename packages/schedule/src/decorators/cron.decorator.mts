import type { CronJobParams } from 'cron'

import { getCronMetadata } from '../metadata/index.mjs'

export interface CronOptions {
  disabled?: boolean
}

export function Cron(
  cronTime: CronJobParams['cronTime'],
  options?: CronOptions,
) {
  return (
    target: () => Promise<void>,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error(
        `Cron can only be applied to methods, not ${context.kind}`,
      )
    }
    if (context.metadata) {
      const metadata = getCronMetadata(target, context)
      metadata.cronTime = cronTime
      metadata.disabled = options?.disabled ?? false
    }
    return target
  }
}
