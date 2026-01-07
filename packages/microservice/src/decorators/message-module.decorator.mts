import type { ClassType, Registry } from '@navios/di'

import { Injectable, InjectableScope, InjectionToken } from '@navios/di'
import { NaviosManagedMetadataKey } from '@navios/core'

import { getMessageModuleMetadata } from '../metadata/message-module.metadata.mjs'

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
  /**
   * Priority to use for the module.
   * Priority is used to sort the module in the registry.
   */
  priority?: number
  /**
   * Registry to use for the module.
   * Registry is used to store the module and its controllers.
   */
  registry?: Registry
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
  {
    controllers = [],
    imports = [],
    guards = [],
    priority,
    registry,
  }: MessageModuleOptions = {
    controllers: [],
    imports: [],
    guards: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios/Microservice] @MessageModule decorator can only be used on classes.',
      )
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
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

    // Store reference to metadata in managed key for AttributeFactory
    if (context.metadata) {
      context.metadata[NaviosManagedMetadataKey] = messageModuleMetadata
      // Also store on target for runtime access
      // @ts-expect-error
      target[NaviosManagedMetadataKey] = messageModuleMetadata
    }

    return Injectable({
      token,
      scope: InjectableScope.Singleton,
      priority,
      registry,
    })(target, context)
  }
}

