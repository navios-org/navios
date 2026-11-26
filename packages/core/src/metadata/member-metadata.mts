import type { ClassType } from '@navios/di'

import { ownMetadata, requireMetadata } from './decorator-metadata.mjs'

import type { DecoratorMetadata } from './decorator-metadata.mjs'

/**
 * What decorators and `handler()` options can attach to a handler.
 */
export interface HandlerExtras {
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
}

/**
 * A class member that is, or may become, a handler: what decorators attached
 * to it.
 */
export interface MethodHandlerMetadata extends HandlerExtras {
  name: string
  /**
   * What makes the member a handler of a transport, under that transport's
   * own symbol.
   */
  entries: Map<symbol, unknown>
}

/** Where the members of a class are kept in its metadata. */
export const MembersKey = Symbol.for('navios.core.members')

/**
 * What decorators attached to a member, inherited ones included, to read and to
 * add to.
 */
export function memberMetadata(
  context: { metadata?: DecoratorMetadata },
  name: string,
): MethodHandlerMetadata {
  const members = ownMetadata<Map<string, MethodHandlerMetadata>>(
    requireMetadata(context),
    MembersKey,
    (inherited) => {
      const copy = new Map<string, MethodHandlerMetadata>()
      if (inherited) {
        for (const [key, value] of inherited) {
          copy.set(key, {
            ...value,
            guards: [...value.guards],
            interceptors: [...value.interceptors],
            attributes: new Map(value.attributes),
            entries: new Map(value.entries),
          })
        }
      }
      return copy
    },
  )
  let member = members.get(name)
  if (!member) {
    member = { name, guards: [], interceptors: [], attributes: new Map(), entries: new Map() }
    members.set(name, member)
  }
  return member
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type ClassOrMemberContext =
  | ClassDecoratorContext
  | ClassMethodDecoratorContext
  | ClassFieldDecoratorContext

/**
 * A decorator for classes, methods and fields that adds to what decorators
 * attached to them: `toClass` is given the context of a class, `toMember` the
 * metadata of a member. `name` names the decorator in its errors.
 * @internal
 */
export function classOrMemberDecorator(
  name: string,
  toClass: (context: ClassDecoratorContext) => void,
  toMember: (member: MethodHandlerMetadata) => void,
): (target: any, context: ClassOrMemberContext) => any {
  return (target, context) => {
    if (context.kind === 'class') {
      toClass(context)
      return target
    }
    if (context.kind !== 'method' && context.kind !== 'field') {
      throw new Error(`[Navios] ${name} can only be used on classes, methods and fields.`)
    }
    if (typeof context.name !== 'string') {
      throw new Error(`[Navios] ${name} cannot be used on symbol-named members.`)
    }
    toMember(memberMetadata(context, context.name))
    return context.kind === 'field' ? undefined : target
  }
}
