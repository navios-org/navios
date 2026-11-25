import type { ClassType } from '@navios/di'

import { classGuards, classInterceptors } from './class-metadata.mjs'
import { memberMetadata } from './member-metadata.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyMemberContext =
  | ClassDecoratorContext
  | ClassMethodDecoratorContext
  | ClassFieldDecoratorContext

/**
 * The decorator behind `@UseGuards` and `@UseInterceptors`: adds classes to
 * the list of a class or of one of its members.
 * @internal
 */
export function attachClasses(
  kind: 'guards' | 'interceptors',
  classes: ClassType[],
  name: string,
): (target: any, context: AnyMemberContext) => any {
  return (target, context) => {
    if (context.kind === 'class') {
      const list = kind === 'guards' ? classGuards(context) : classInterceptors(context)
      for (const cls of classes) {
        if (!list.includes(cls)) {
          list.push(cls)
        }
      }
      return target
    }
    if (context.kind !== 'method' && context.kind !== 'field') {
      throw new Error(`[Navios] @${name} can only be used on classes, methods and fields.`)
    }
    if (typeof context.name !== 'string') {
      throw new Error(`[Navios] @${name} cannot be used on symbol-named members.`)
    }
    const list = memberMetadata(context, context.name)[kind]
    for (const cls of classes) {
      if (!list.includes(cls)) {
        list.push(cls)
      }
    }
    return context.kind === 'field' ? undefined : target
  }
}
