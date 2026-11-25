import { Injectable, InjectableScope } from '@navios/di'

import type { ClassType } from '@navios/di'

import { getMessageModuleMetadata } from './message-module-metadata.mjs'

/**
 * Options for configuring a Navios message module.
 */
export interface MessageModuleOptions {
  /**
   * Message controllers to register in this module.
   * Controllers handle messages and define message handlers.
   */
  controllers?: ClassType[] | Set<ClassType>
  /**
   * Other message modules to import into this module.
   * Imported modules' controllers become available.
   */
  imports?: ClassType[] | Set<ClassType>
  /**
   * Guards to apply to all controllers in this module.
   * Guards are executed in reverse order (last guard first).
   */
  guards?: ClassType[] | Set<ClassType>
}

/**
 * Decorator that marks a class as a Navios message module.
 *
 * Message modules are the basic building blocks of a Navios microservice.
 * They organize message controllers and other modules into logical units.
 *
 * @param options - Message module configuration options
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @MessageModule({
 *   controllers: [UserMessageController, OrderMessageController],
 *   imports: [DatabaseModule],
 *   guards: [AuthGuard],
 * })
 * export class AppMessageModule {}
 * ```
 */
export function MessageModule(
  { controllers = [], imports = [], guards = [] }: MessageModuleOptions = {
    controllers: [],
    imports: [],
    guards: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error('[Navios/Microservice] @MessageModule decorator can only be used on classes.')
    }
    const messageModuleMetadata = getMessageModuleMetadata(target, context)
    for (const controller of controllers) {
      messageModuleMetadata.controllers.add(controller)
    }
    for (const importedModule of imports) {
      messageModuleMetadata.imports.add(importedModule)
    }
    for (const guard of Array.from(guards).reverse()) {
      messageModuleMetadata.guards.add(guard)
    }

    return Injectable({ scope: InjectableScope.Singleton })(target, context)
  }
}
