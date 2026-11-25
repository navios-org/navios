import type { ClassType } from '@navios/di'

// Track all @Traceable/@Traced decorated classes
// This Set is populated at decoration time (module load), not at instantiation
export const traceableServices = new Set<ClassType>()

/**
 * Returns the set of all classes decorated with @Traceable or @Traced.
 * Used by the plugin to find services that need wrapping.
 */
export function getTraceableServices(): ReadonlySet<ClassType> {
  return traceableServices
}
