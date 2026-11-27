import { InjectableScope, registerInjectable } from '@navios/core'

import type { AttributeValue, ClassType, GuardClass, InterceptorClass } from '@navios/core'

import { assertStandardDecorator } from '../internal/standard-decorator.mjs'

import { defineControllerMetadata } from './controller-metadata.mjs'

export interface ControllerOptions {
  guards?: GuardClass[]
  interceptors?: InterceptorClass[]
  /** Attribute values for the whole controller: `[Public()]`. */
  attributes?: AttributeValue[]
}

/**
 * Marks a class as a controller. Controllers are singletons: per-request
 * data comes from the `RequestContext` passed to each handler.
 */
export function Controller(options: ControllerOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    assertStandardDecorator('Controller', context)
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Controller can only be used on classes.')
    }
    defineControllerMetadata(target, context, options)
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

/**
 * Registers a class as a controller without decorator syntax. Meant for
 * library code that is built without a decorator transform; its handlers are
 * `handler()` fields.
 *
 * ```ts
 * class DocsController {
 *   spec = handler(specEndpoint, () => document)
 * }
 * registerController(DocsController)
 * ```
 */
export function registerController<T extends ClassType>(
  target: T,
  options: ControllerOptions = {},
): T {
  defineControllerMetadata(target, { metadata: {} }, options)
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}
