/**
 * Compatibility layer for converting legacy decorator signatures to Stage 3 format.
 *
 * This module provides utilities to create mock Stage 3 decorator contexts
 * from legacy decorator arguments, and manages metadata storage using WeakMap.
 */

import type { ClassType } from '@navios/di'

// WeakMap to store metadata for legacy decorators
// Keyed by class constructor for class decorators
// For method decorators, we use the class constructor (extracted from the prototype)
const classMetadataMap = new WeakMap<ClassType, Record<string | symbol, any>>()

/**
 * Gets the constructor from a prototype (for method decorators).
 */
function getConstructor(prototype: any): ClassType | null {
  if (!prototype || typeof prototype !== 'object') {
    return null
  }
  // In legacy decorators, target is the prototype
  // The constructor is typically available via prototype.constructor
  const constructor = prototype.constructor
  if (constructor && typeof constructor === 'function') {
    return constructor as ClassType
  }
  return null
}

/**
 * Creates a mock ClassDecoratorContext for legacy class decorators.
 */
export function createClassContext(target: ClassType): ClassDecoratorContext {
  // Get or create metadata storage for this class
  if (!classMetadataMap.has(target)) {
    classMetadataMap.set(target, {})
  }
  const metadata = classMetadataMap.get(target)!

  return {
    kind: 'class',
    name: target.name,
    metadata,
    addInitializer() {
      // Legacy decorators don't support initializers
    },
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
  // For method decorators, target is the prototype
  // We need to get the class constructor to access class-level metadata
  const constructor = getConstructor(target)
  if (!constructor) {
    throw new Error(
      '[Navios] Could not determine class constructor from method decorator target.',
    )
  }

  // Get or create metadata storage for the class
  // Method decorators share metadata with the class
  if (!classMetadataMap.has(constructor)) {
    classMetadataMap.set(constructor, {})
  }
  const metadata = classMetadataMap.get(constructor)!

  return {
    kind: 'method',
    name: propertyKey,
    metadata,
    static: false, // We can't determine this from legacy decorators
    private: false, // We can't determine this from legacy decorators
    access: {
      has: () => true,
      get: () => descriptor.value,
      set: () => {},
    },
    addInitializer() {
      // Legacy decorators don't support initializers
    },
  } as ClassMethodDecoratorContext
}
