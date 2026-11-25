import type { ClassType } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'

import type { RequestValueClass } from '../context/request-value.mjs'

declare module '@navios/core' {
  interface ModuleOptions {
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
}

/** A module's own route prefix, as written. */
export function modulePrefix(node: ModuleNode): string {
  return (node.entries.get('prefix') as string | undefined) ?? ''
}

/** A module's controllers, without duplicates. */
export function moduleControllers(node: ModuleNode): ClassType[] {
  const controllers = node.entries.get('controllers') as Iterable<ClassType> | undefined
  if (!controllers) {
    return []
  }
  const classes = Array.from(new Set(controllers))
  const index = classes.findIndex((controller) => typeof controller !== 'function')
  if (index >= 0) {
    throw new Error(
      `[Navios] Module ${node.module.name} lists ${String(classes[index])} in controllers. When it ` +
        `should be a class, the files of the two usually import each other.`,
    )
  }
  return classes
}

/** The request values a module asks to build at boot. */
export function moduleRequestValues(node: ModuleNode): RequestValueClass[] {
  const values = node.entries.get('requestValues') as Iterable<RequestValueClass> | undefined
  return values ? [...values] : []
}
