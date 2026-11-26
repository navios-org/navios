import type { ClassType } from '@navios/di'

/** What a class decorator stores on the class it decorates. */
export interface ClassMetadata<T> {
  /** Stores `value` on `target`, where it is not enumerable and can be replaced. */
  define(target: ClassType, value: T): void
  /**
   * What is stored on `target` itself. A subclass does not inherit it: it is
   * not what the decorator makes of a class unless it is decorated itself.
   * Throws when there is none.
   */
  get(target: ClassType): T
  /** Whether `get` would find something. */
  has(target: ClassType): boolean
}

/**
 * Metadata that a class decorator stores on classes under `key`. `what` and
 * `decorator` name it when a class has none: `Users is not a controller. Make
 * sure it is decorated with @Controller.`
 *
 * ```ts
 * const queueHandlers = classMetadata<HandlerClassMetadata>(
 *   Symbol.for('my-transport.handlers'),
 *   'a queue handler',
 *   'QueueHandler',
 * )
 * ```
 */
export function classMetadata<T>(key: symbol, what: string, decorator: string): ClassMetadata<T> {
  const has = (target: ClassType): boolean => Object.hasOwn(target, key)
  return {
    define(target, value) {
      Object.defineProperty(target, key, { value, configurable: true, enumerable: false })
    },
    get(target) {
      if (!has(target)) {
        throw new Error(
          `[Navios] ${target.name} is not ${what}. Make sure it is decorated with @${decorator}.`,
        )
      }
      return (target as unknown as Record<symbol, T>)[key]
    },
    has,
  }
}
