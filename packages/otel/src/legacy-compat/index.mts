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
export type { TracedOptions } from '../interfaces/index.mjs'
export type {
  TracedMetadata,
  ClassTracedMetadata,
  MethodTracedMetadata,
} from '../decorators/index.mjs'

// Re-export metadata utilities from main module
export {
  getTracedMetadata,
  hasTracedMetadata,
  TRACED_METADATA_KEY,
} from '../decorators/index.mjs'

// Export legacy-compatible decorators
export { Traced } from './decorators/index.mjs'
