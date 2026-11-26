import type { ClassType } from '@navios/di'

import { addMissing, classGuards, classInterceptors } from './class-metadata.mjs'
import { classOrMemberDecorator } from './member-metadata.mjs'

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
  return classOrMemberDecorator(
    `@${name}`,
    (context) => {
      addMissing(kind === 'guards' ? classGuards(context) : classInterceptors(context), classes)
    },
    (member) => {
      addMissing(member[kind], classes)
    },
  )
}
