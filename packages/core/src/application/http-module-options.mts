import type { ClassType } from '@navios/di'

import {
  Module as NeutralModule,
  registerModule as registerNeutralModule,
} from '../modules/module.mjs'

import type { RequestValueClass } from '../context/request-value.mjs'
import type { ModuleNode } from '../modules/module-graph.mjs'
import type { ModuleOptions } from '../modules/module-options.mjs'

/**
 * What `@Module` accepts in an HTTP application: the options every
 * application understands, and the ones that describe routes.
 */
export interface HttpModuleOptions extends ModuleOptions {
  /** Path prefix for every route of this module and of the modules it imports. */
  prefix?: string
  controllers?: ClassType[]
  /**
   * Request values to build while the application initialises. Needed for a
   * value that has, directly or through a service, a dependency with an
   * asynchronous initialiser that nothing else builds at boot; listing a
   * value also turns an error in its construction into an error of `init()`.
   */
  requestValues?: RequestValueClass[]
}

/**
 * Marks a class as a module: a group of routes with a shared prefix, guards
 * and interceptors.
 */
export const Module = NeutralModule as (
  options?: HttpModuleOptions,
) => <T extends ClassType>(target: T, context: ClassDecoratorContext) => T

/**
 * Registers a class as a module without decorator syntax.
 */
export const registerModule = registerNeutralModule as <T extends ClassType>(
  target: T,
  options?: HttpModuleOptions,
) => T

/** A module's own route prefix, as written. */
export function modulePrefix(node: ModuleNode): string {
  return (node.entries.get('prefix') as string | undefined) ?? ''
}

/** A module's controllers, without duplicates. */
export function moduleControllers(node: ModuleNode): ClassType[] {
  const controllers = node.entries.get('controllers') as Iterable<ClassType> | undefined
  return controllers ? Array.from(new Set(controllers)) : []
}

/** The request values a module asks to build at boot. */
export function moduleRequestValues(node: ModuleNode): RequestValueClass[] {
  const values = node.entries.get('requestValues') as Iterable<RequestValueClass> | undefined
  return values ? [...values] : []
}
