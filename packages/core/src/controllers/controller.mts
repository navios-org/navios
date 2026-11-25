import { InjectableScope, registerInjectable } from '@navios/di'

import type { ClassType } from '@navios/di'

import { applyAttributes } from '../attributes/attribute-value.mjs'

import type { AttributeValue } from '../attributes/attribute-value.mjs'

import { defineControllerMetadata } from './controller-metadata.mjs'

export interface ControllerOptions {
  guards?: ClassType[]
  interceptors?: ClassType[]
  /** Attribute values for the whole controller: `[Public()]`. */
  attributes?: AttributeValue[]
}

/**
 * Marks a class as a controller. Controllers are singletons: per-request
 * data comes from the `RequestContext` passed to each handler.
 */
export function Controller(options: ControllerOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Controller can only be used on classes.')
    }
    applyAttributes(
      defineControllerMetadata(target, context, options).attributes,
      options.attributes,
    )
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
  applyAttributes(
    defineControllerMetadata(target, { metadata: {} }, options).attributes,
    options.attributes,
  )
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}
