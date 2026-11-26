import { ownMetadata, requireMetadata } from '@navios/core/transport'

import type { ClassType } from '@navios/di'
import type { AttributeValue } from '@opentelemetry/api'

/**
 * Symbol used to store traced metadata in context.metadata.
 */
export const TracedMetadataKey = Symbol('navios:traced:metadata')

/**
 * Metadata stored by the @Traced decorator.
 */
export interface TracedMetadata {
  /**
   * Custom span name.
   */
  name?: string

  /**
   * Additional attributes to add to spans.
   */
  attributes?: Record<string, AttributeValue>

  /**
   * Whether tracing is enabled for this target.
   */
  enabled: boolean
}

/**
 * Method-level traced metadata.
 */
export interface MethodTracedMetadata extends TracedMetadata {
  /**
   * The method name this metadata applies to.
   */
  methodName: string
}

/**
 * Class-level traced metadata.
 */
export interface ClassTracedMetadata extends TracedMetadata {
  /**
   * Method-specific overrides.
   */
  methods: Map<string, MethodTracedMetadata>
}

// The classes decorated with `@Traced` or `@Traceable`, filled when they are
// decorated. Only a class decorated itself is in it: a subclass without a
// decorator is not what the decorator made of its parent.
const tracedClasses = new Map<ClassType, ClassTracedMetadata>()

/**
 * Gets or creates traced metadata during decoration.
 * Used inside decorators with access to context.metadata.
 *
 * For class decorators, also records the class for runtime extraction.
 * For method decorators, only uses context.metadata (shared with class decorator).
 *
 * @param context - The decorator context
 * @param target - The class being decorated (only for class decorators)
 * @returns The class traced metadata
 */
export function getTracedMetadata(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  target?: ClassType,
): ClassTracedMetadata {
  // A subclass starts from a copy: the metadata object of its base class is the
  // prototype of its own, and other subclasses share it.
  const metadata = ownMetadata<ClassTracedMetadata>(
    requireMetadata(context),
    TracedMetadataKey,
    (inherited) => ({
      name: inherited?.name,
      attributes: inherited?.attributes,
      enabled: inherited?.enabled ?? false,
      methods: new Map(inherited?.methods),
    }),
  )
  // Method decorators, which run first, may have created the metadata.
  if (target) {
    tracedClasses.set(target, metadata)
  }
  return metadata
}

/**
 * Extracts traced metadata from an already-decorated class.
 * Used at runtime when context is not available.
 *
 * @param target - The decorated class
 * @returns The class traced metadata
 * @throws Error if the class itself is not decorated
 */
export function extractTracedMetadata(target: ClassType): ClassTracedMetadata {
  const metadata = tracedClasses.get(target)
  if (!metadata) {
    throw new Error(
      `[Navios] Traced metadata not found on ${target.name}. Make sure to use @Traceable or @Traced decorator.`,
    )
  }
  return metadata
}

/**
 * Checks if a class is decorated with `@Traced` or `@Traceable` itself.
 *
 * @param target - The class to check
 * @returns True if the class has traced metadata
 */
export function hasTracedMetadata(target: ClassType): boolean {
  return tracedClasses.has(target)
}

/**
 * Returns the set of all classes decorated with @Traceable or @Traced.
 * Used by the plugin to find services that need wrapping.
 */
export function getTraceableServices(): ReadonlySet<ClassType> {
  return new Set(tracedClasses.keys())
}
