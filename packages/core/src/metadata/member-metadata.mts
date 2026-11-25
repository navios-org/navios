import type { ClassType } from '@navios/di'

import { own, requireMetadata } from './decorator-metadata.mjs'

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

/** @internal */
export const MembersKey = Symbol.for('navios.core.members')

/** @internal */
export function memberMetadata(
  context: { metadata?: DecoratorMetadata },
  name: string,
): MethodHandlerMetadata {
  const members = own<Map<string, MethodHandlerMetadata>>(
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
