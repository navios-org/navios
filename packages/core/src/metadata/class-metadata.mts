import type { ClassType } from '@navios/di'

import { own, requireMetadata } from './decorator-metadata.mjs'

import type { DecoratorMetadata } from './decorator-metadata.mjs'

const ClassAttributesKey = Symbol.for('navios.core.classAttributes')
const ClassGuardsKey = Symbol.for('navios.core.classGuards')
const ClassInterceptorsKey = Symbol.for('navios.core.classInterceptors')

/** @internal */
export function classAttributes(context: { metadata?: DecoratorMetadata }): Map<symbol, unknown> {
  return own(requireMetadata(context), ClassAttributesKey, (inherited) => new Map(inherited))
}

/** @internal */
export function classGuards(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return own<ClassType[]>(requireMetadata(context), ClassGuardsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

/** @internal */
export function classInterceptors(context: { metadata?: DecoratorMetadata }): ClassType[] {
  return own<ClassType[]>(requireMetadata(context), ClassInterceptorsKey, (inherited) => [
    ...(inherited ?? []),
  ])
}

/** @internal */
export function unique(list: ClassType[]): ClassType[] {
  return Array.from(new Set(list))
}

/**
 * Puts `first` in front of `list`, in place, skipping duplicates.
 * @internal
 */
export function prepend(list: ClassType[], first: Iterable<ClassType> | undefined): ClassType[] {
  if (first) {
    const added = unique([...first]).filter((item) => !list.includes(item))
    list.unshift(...added)
  }
  return list
}
