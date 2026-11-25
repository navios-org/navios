import type { ClassType } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'

declare module '@navios/core' {
  interface ModuleOptions {
    /** `@Schedulable()` classes whose jobs `scheduleTransport()` runs. */
    jobs?: ClassType[]
  }
}

/** The schedulable classes of a module. */
export function moduleJobs(node: ModuleNode): ClassType[] {
  const jobs = [...((node.entries.get('jobs') as Iterable<ClassType> | undefined) ?? [])]
  const index = jobs.findIndex((job) => typeof job !== 'function')
  if (index >= 0) {
    throw new Error(
      `[Navios-Schedule] Module ${node.module.name} lists ${String(jobs[index])} in jobs. When it ` +
        `should be a class, the files of the two usually import each other.`,
    )
  }
  return jobs
}
