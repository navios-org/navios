import type { Container } from '@navios/core'

import type { JobRun } from '../jobs/scheduled-job.mjs'

/** What the transport of an application tells the scheduler. */
export interface ScheduleSettings {
  timeZone?: string
  onError?: (error: unknown, run: JobRun) => void | Promise<void>
}

// Known before the scheduler is resolved, whoever resolves it first: a module
// registers classes in `onModuleInit`, which is before the transport's `setup`.
const settingsByContainer = new WeakMap<Container, ScheduleSettings>()

/**
 * Declares that a transport drives the scheduler of this container.
 * @throws when another one already does
 */
export function driveScheduler(container: Container, settings: ScheduleSettings): void {
  if (settingsByContainer.has(container)) {
    throw new Error(
      '[Navios-Schedule] An application has one schedule transport. List the classes of every ' +
        'feature in it, or in the `jobs` of their modules.',
    )
  }
  settingsByContainer.set(container, settings)
}

/** The settings of the transport that drives the scheduler of this container. */
export function scheduleSettings(container: Container): ScheduleSettings | undefined {
  return settingsByContainer.get(container)
}
