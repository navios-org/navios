import { InjectableScope, registerInjectable } from '@navios/di'

import type { ClassType } from '@navios/di'

import { applyAttributes } from '../attributes/attribute-value.mjs'

import type { DecoratorMetadata } from '../metadata/decorator-metadata.mjs'

import { defineModuleMetadata } from './module-metadata.mjs'

import type { ModuleOptions } from './module-options.mjs'

function defineModule<T extends ClassType>(
  target: T,
  context: { metadata?: DecoratorMetadata },
  options: ModuleOptions,
): T {
  applyAttributes(defineModuleMetadata(target, context, options).attributes, options.attributes)
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}

/**
 * Marks a class as a module: a group of handlers with shared guards,
 * interceptors and attributes.
 */
export function Module(options: ModuleOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module can only be used on classes.')
    }
    return defineModule(target, context, options)
  }
}

/**
 * Registers a class as a module without decorator syntax.
 */
export function registerModule<T extends ClassType>(target: T, options: ModuleOptions = {}): T {
  return defineModule(target, { metadata: {} }, options)
}
