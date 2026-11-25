import type { ClassType } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'

declare module '@navios/core' {
  interface ModuleOptions {
    /** Classes whose `@Message` methods handle this module's messages. */
    messageControllers?: ClassType[]
  }
}

/** A module's message controllers, without duplicates. */
export function moduleMessageControllers(node: ModuleNode): ClassType[] {
  const controllers = node.entries.get('messageControllers') as Iterable<ClassType> | undefined
  return controllers ? Array.from(new Set(controllers)) : []
}
