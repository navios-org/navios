import type { ClassType } from '@navios/di'

import { applyAttributes } from '../attributes/attribute-value.mjs'

import type { AttributeValue } from '../attributes/attribute-value.mjs'

import { classAttributes, classGuards, classInterceptors, prepend } from './class-metadata.mjs'
import { requireMetadata } from './decorator-metadata.mjs'
import { MembersKey } from './member-metadata.mjs'

import type { DecoratorMetadata } from './decorator-metadata.mjs'
import type { HandlerExtras, MethodHandlerMetadata } from './member-metadata.mjs'

/** What a transport's decorator for handler classes may take. */
export interface HandlerClassOptions {
  guards?: Iterable<ClassType>
  interceptors?: Iterable<ClassType>
  attributes?: AttributeValue[]
}

/** A class that owns handlers: what applies to all of them, and its members. */
export interface HandlerClassMetadata extends HandlerExtras {
  /** The members decorators were applied to, by name. */
  members: Map<string, MethodHandlerMetadata>
}

/**
 * What decorators attached to a class of handlers and to its members, together
 * with the options of the class decorator that asks. The lists are live:
 * `@UseGuards` and the like placed above that decorator run after it and are
 * still seen.
 */
export function describeHandlerClass(
  context: { metadata?: DecoratorMetadata },
  options: HandlerClassOptions = {},
): HandlerClassMetadata {
  const metadata = requireMetadata(context)
  const attributes = classAttributes(context)
  applyAttributes(attributes, options.attributes)
  return {
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    attributes,
    members: (metadata[MembersKey] as Map<string, MethodHandlerMetadata> | undefined) ?? new Map(),
  }
}
