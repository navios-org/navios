/**
 * The decorators for projects that keep `experimentalDecorators: true`.
 * Everything else comes from `@navios/otel`, and works with both.
 *
 * @example
 * ```typescript
 * import { Traced } from '@navios/otel/legacy-compat'
 * import { Injectable } from '@navios/core/legacy-compat'
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
import { legacy } from '@navios/core/legacy-compat'

import type { ClassType } from '@navios/core'
import type { LegacyAnyDecorator } from '@navios/core/legacy-compat'

import { Traceable as StandardTraceable, Traced as StandardTraced } from '../traced/traced.mjs'

import type { TracedOptions } from '../traced/traced-metadata.mjs'

export type { TracedOptions }

/**
 * `@Traced` for legacy decorators: on a class it traces every method, on a
 * method only that method.
 */
export function Traced(options: TracedOptions = {}): LegacyAnyDecorator {
  return legacy(StandardTraced(options))
}

/**
 * `@Traceable` for legacy decorators: marks a class whose `@Traced` methods
 * are traced.
 */
export function Traceable(options: TracedOptions = {}) {
  return legacy(StandardTraceable(options)) as <T extends ClassType>(target: T) => T
}
