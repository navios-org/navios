import { moduleClasses } from '@navios/core/transport'

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
  return moduleClasses(node, 'messageControllers')
}
