/**
 * Legacy-compatible decorators for projects that cannot use Stage 3 decorators.
 *
 * These decorators use the TypeScript experimental decorator API and convert
 * the arguments to Stage 3 format internally.
 *
 * @example
 * ```typescript
 * import { Traced } from '@navios/otel/legacy-compat'
 * import { Injectable } from '@navios/di/legacy-compat'
 *
 * @Injectable()
 * @Traced({ name: 'user-service' })
 * export class UserService {
 *   async getUser(id: string) {
 *     // Creates span: "user-service.getUser"
 *   }
 * }
 * ```
 */

// Re-export types from main module
export type { TracedOptions } from '../traced/traced-options.mjs'
export type {
  TracedMetadata,
  ClassTracedMetadata,
  MethodTracedMetadata,
} from '../traced/traced-metadata.mjs'

// Re-export metadata utilities from main module (they work the same for both APIs)
export {
  extractTracedMetadata,
  getTraceableServices,
  getTracedMetadata,
  hasTracedMetadata,
  TracedMetadataKey,
} from '../traced/traced-metadata.mjs'

// Export legacy-compatible decorators
export { Traceable } from './traceable.mjs'
export { Traced } from './traced.mjs'
