import type { ClassType } from '@navios/di'

import { ownMetadata, requireMetadata } from './decorator-metadata.mjs'

import type { DecoratorMetadata } from './decorator-metadata.mjs'

const ClassAttributesKey = Symbol.for('navios.core.classAttributes')
const ClassGuardsKey = Symbol.for('navios.core.classGuards')
const ClassInterceptorsKey = Symbol.for('navios.core.classInterceptors')

/** The attributes of a class, inherited ones included, to read and to add to. */
export function classAttributes(context: { metadata?: DecoratorMetadata }): Map<symbol, unknown> {
  return ownMetadata(
    requireMetadata(context),
    ClassAttributesKey,
    (inherited) => new Map(inherited),
  )
}

/** The guards of a class, as `classAttributes`. */
export function classGuards(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return ownMetadata<ClassType[]>(requireMetadata(context), ClassGuardsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

/** The interceptors of a class, as `classAttributes`. */
export function classInterceptors(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return ownMetadata<ClassType[]>(requireMetadata(context), ClassInterceptorsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

/** @internal */
export function unique(list: ClassType[]): ClassType[] {
  return Array.from(new Set(list))
}

/**
 * Adds to `list`, in place, what it does not include yet, in order.
 * @internal
 */
export function addMissing<T>(list: T[], items: Iterable<T>): T[] {
  for (const item of items) {
    if (!list.includes(item)) {
      list.push(item)
    }
  }
  return list
}

/**
 * Puts `first` in front of `list`, in place, skipping duplicates.
 */
export function prepend(list: ClassType[], first: Iterable<ClassType> | undefined): ClassType[] {
  if (first) {
    list.unshift(...addMissing([], first).filter((item) => !list.includes(item)))
  }
  return list
}
