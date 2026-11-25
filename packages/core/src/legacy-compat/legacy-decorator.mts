import { createClassContext, createMethodContext } from '@navios/di/legacy-compat'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type StandardDecorator = (target: any, context: any) => any

/** A decorator that accepts every legacy call shape. */
export type LegacyAnyDecorator = (
  target: any,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
) => any

/**
 * Turns a standard decorator into one that accepts the legacy call shapes:
 * `(constructor)`, `(prototype, key, descriptor)` and `(prototype, key)`.
 */
export function legacy(decorator: StandardDecorator) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): any => {
    if (propertyKey === undefined) {
      return decorator(target, createClassContext(target)) ?? target
    }
    if (descriptor && typeof descriptor.value === 'function') {
      const context = createMethodContext(target, propertyKey, descriptor)
      const replaced = decorator(descriptor.value, context)
      if (replaced && replaced !== descriptor.value) {
        descriptor.value = replaced
      }
      return descriptor
    }
    const context = createMethodContext(target, propertyKey, descriptor ?? {})
    decorator(undefined, { ...context, kind: 'field' })
    return undefined
  }
}
