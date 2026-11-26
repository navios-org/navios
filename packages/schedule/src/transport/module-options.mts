import { moduleClasses } from '@navios/core/transport'

import type { ClassType } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'

declare module '@navios/core' {
  interface ModuleOptions {
    /** `@Schedulable()` classes whose jobs `scheduleTransport()` runs. */
    jobs?: ClassType[]
  }
}

/** The schedulable classes of a module, without duplicates. */
export function moduleJobs(node: ModuleNode): ClassType[] {
  return moduleClasses(node, 'jobs')
}
