/**
 * Compatibility layer for converting legacy decorator signatures to Stage 3 format.
 *
 * This module provides utilities to create mock Stage 3 decorator contexts
 * from legacy decorator arguments, and manages metadata storage using WeakMap.
 */

import { misuse } from '../errors/create.mjs'

import type { AbstractClassType, ClassType } from '../token/class-type.mjs'

type Metadata = Record<PropertyKey, unknown>

// Metadata of legacy decorated classes, by constructor. Member decorators use
// the same object as the decorators of their class.
const classMetadata = new WeakMap<AbstractClassType, Metadata>()

/**
 * The metadata object of a class. As with standard decorators its prototype is
 * the metadata of the base class, so a subclass inherits what was recorded
 * there: guards, attributes, endpoints.
 */
function metadataOf(target: AbstractClassType): Metadata {
  let metadata = classMetadata.get(target)
  if (metadata === undefined) {
    const base: unknown = Object.getPrototypeOf(target)
    metadata = Object.create(
      typeof base === 'function' && base !== Function.prototype
        ? metadataOf(base as AbstractClassType)
        : null,
    ) as Metadata
    classMetadata.set(target, metadata)
  }
  return metadata
}

/** The class whose member a legacy decorator was applied to. */
function classOf(target: unknown): AbstractClassType {
  // A static member comes with its class, any other with the prototype.
  const constructor =
    typeof target === 'function'
      ? target
      : (target as { constructor?: unknown } | null)?.constructor
  if (typeof constructor !== 'function') {
    throw misuse('Could not determine the class of a legacy member decorator')
  }
  return constructor as AbstractClassType
}

function addInitializer() {
  // Legacy decorators don't support initializers
}

/**
 * Creates a mock ClassDecoratorContext for legacy class decorators.
 */
export function createClassContext(target: ClassType): ClassDecoratorContext {
  return {
    kind: 'class',
    name: target.name,
    metadata: metadataOf(target),
    addInitializer,
  } as ClassDecoratorContext
}

/**
 * Creates a mock ClassMethodDecoratorContext for legacy method decorators.
 *
 * Note: Method decorators need to share metadata with the class context
 * because endpoint metadata is stored at the class level.
 */
export function createMethodContext(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): ClassMethodDecoratorContext {
  return {
    kind: 'method',
    name: propertyKey,
    metadata: metadataOf(classOf(target)),
    static: typeof target === 'function',
    private: false, // Legacy decorators cannot be applied to private members
    access: {
      has: () => true,
      get: () => descriptor.value,
      set: () => {},
    },
    addInitializer,
  } as ClassMethodDecoratorContext
}
