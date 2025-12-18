import type { ClassType } from '@navios/core'

import { Injectable, InjectableScope, InjectionToken } from '@navios/core'

import { getCliModuleMetadata } from '../metadata/index.mjs'

export interface CliModuleOptions {
  commands?: ClassType[] | Set<ClassType>
  imports?: ClassType[] | Set<ClassType>
}

export function CliModule(
  { commands = [], imports = [] }: CliModuleOptions = {
    commands: [],
    imports: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios Commander] @CliModule decorator can only be used on classes.',
      )
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
    const moduleMetadata = getCliModuleMetadata(target, context)
    for (const command of commands) {
      moduleMetadata.commands.add(command)
    }
    for (const importedModule of imports) {
      moduleMetadata.imports.add(importedModule)
    }

    return Injectable({
      token,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}
