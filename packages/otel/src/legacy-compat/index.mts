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

import { getTracedMetadata, markMethodOwner } from '../traced/traced-metadata.mjs'
import { Traceable as StandardTraceable, Traced as StandardTraced } from '../traced/traced.mjs'

import type { TracedOptions } from '../traced/traced-metadata.mjs'

export type { TracedOptions }

/**
 * `@Traced` for legacy decorators: on a class it traces every method, on a
 * method only that method, whether or not the class is decorated too.
 */
export function Traced(options: TracedOptions = {}): LegacyAnyDecorator {
  const standard = StandardTraced(options)
  let methodContext: ClassMethodDecoratorContext | undefined
  const decorate = legacy((target, context) => {
    methodContext = context.kind === 'method' ? context : undefined
    return standard(target, context)
  })
  return (target, propertyKey, descriptor) => {
    const result = decorate(target, propertyKey, descriptor)
    if (methodContext !== undefined) {
      // A legacy method decorator has no initializers, but it knows its
      // class: record it, so that the plugin traces the method even when the
      // class has no `@Traced` or `@Traceable` of its own.
      const owner = typeof target === 'function' ? target : target.constructor
      markMethodOwner(owner as ClassType, getTracedMetadata(methodContext))
      methodContext = undefined
    }
    return result
  }
}

/**
 * `@Traceable` for legacy decorators: marks a class whose `@Traced` methods
 * are traced.
 */
export function Traceable(options: TracedOptions = {}) {
  return legacy(StandardTraceable(options)) as <T extends ClassType>(target: T) => T
}
