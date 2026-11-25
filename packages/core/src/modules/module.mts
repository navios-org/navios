import { InjectableScope, registerInjectable } from '@navios/di'

import type { ClassType, Provider } from '@navios/di'

import { applyAttributes } from '../attributes/attribute-value.mjs'

import type { AttributeValue } from '../attributes/attribute-value.mjs'
import type { RequestValueClass } from '../context/request-value.mjs'

import { defineModuleMetadata } from './module-metadata.mjs'

export interface ModuleOptions {
  /** Path prefix for every route of this module and of the modules it imports. */
  prefix?: string
  imports?: ClassType[]
  controllers?: ClassType[]
  /** Guards for every route of this module and of the modules it imports. */
  guards?: ClassType[]
  interceptors?: ClassType[]
  /** Providers for the whole application (modules do not encapsulate them). */
  providers?: Provider[]
  /**
   * Request values to build while the application initialises. Needed for a
   * value that has, directly or through a service, a dependency with an
   * asynchronous initialiser that nothing else builds at boot; listing a
   * value also turns an error in its construction into an error of `init()`.
   */
  requestValues?: RequestValueClass[]
  /** Attribute values for every route of this module: `[Public()]`. */
  attributes?: AttributeValue[]
}

/**
 * Marks a class as a module: a group of routes with a shared prefix, guards
 * and interceptors.
 */
export function Module(options: ModuleOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module can only be used on classes.')
    }
    applyAttributes(defineModuleMetadata(target, context, options).attributes, options.attributes)
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

/**
 * Registers a class as a module without decorator syntax.
 */
export function registerModule<T extends ClassType>(target: T, options: ModuleOptions = {}): T {
  applyAttributes(
    defineModuleMetadata(target, { metadata: {} }, options).attributes,
    options.attributes,
  )
  registerInjectable(target, { scope: InjectableScope.Singleton })
  return target
}
