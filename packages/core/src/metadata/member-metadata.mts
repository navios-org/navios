import type { ClassType } from '@navios/di'

import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'

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
 * A handler declared with `@Endpoint` on a method.
 */
export interface MethodHandlerMetadata extends HandlerExtras {
  name: string
  config: RouteEndpointConfig | null
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
          })
        }
      }
      return copy
    },
  )
  let member = members.get(name)
  if (!member) {
    member = { name, config: null, guards: [], interceptors: [], attributes: new Map() }
    members.set(name, member)
  }
  return member
}
