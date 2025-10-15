import type { ClassType } from '@navios/di'
import type { ZodObject } from 'zod'

import { Injectable, InjectableScope, InjectionToken } from '@navios/di'

import { getCommandMetadata } from '../metadata/index.mjs'

export interface CommandOptions {
  path: string
  optionsSchema?: ZodObject
}

export function Command({ path, optionsSchema }: CommandOptions) {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios Commander] @Command decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      getCommandMetadata(target, context, path, optionsSchema)
    }
    return Injectable({
      token,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}
