import { ownMetadata, requireMetadata } from '@navios/core/transport'

import type { ClassType } from '@navios/core'
import type { AttributeValue } from '@opentelemetry/api'

// Where the decorators of a class keep their metadata in context.metadata.
const TracedMetadataKey = Symbol('navios:traced:metadata')

/**
 * Options for the @Traced decorator.
 */
export interface TracedOptions {
  /**
   * Custom span name.
   * If not provided, defaults to class.method name.
   */
  name?: string

  /**
   * Additional attributes to add to spans.
   */
  attributes?: Record<string, AttributeValue>
}

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

const classes = new Map<ClassType, ClassTracedMetadata>()

/**
 * The classes decorated with `@Traced` or `@Traceable`, with their metadata,
 * filled when they are decorated. Only a class decorated itself is in it: a
 * subclass without a decorator is not what the decorator made of its parent.
 */
export const tracedClasses: ReadonlyMap<ClassType, ClassTracedMetadata> = classes

/**
 * Gets or creates traced metadata during decoration.
 * Used inside decorators with access to context.metadata, which the method
 * decorators of a class share with its class decorator.
 *
 * @param context - The decorator context
 * @returns The class traced metadata
 */
export function getTracedMetadata(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
): ClassTracedMetadata {
  // A subclass starts from a copy: the metadata object of its base class is the
  // prototype of its own, and other subclasses share it.
  return ownMetadata<ClassTracedMetadata>(
    requireMetadata(context),
    TracedMetadataKey,
    (inherited) => ({
      name: inherited?.name,
      attributes: inherited?.attributes,
      enabled: inherited?.enabled ?? false,
      methods: new Map(inherited?.methods),
    }),
  )
}

/**
 * Records a class whose only mark is `@Traced` on a method. Legacy method
 * decorators know their class, so they call this; a class decorator that
 * runs afterwards records the class itself.
 */
export function markMethodOwner(target: ClassType, metadata: ClassTracedMetadata): void {
  if (!classes.has(target)) {
    classes.set(target, metadata)
  }
}

/**
 * What `@Traced` (`enabled`) and `@Traceable` do to a class. The options are
 * added to what the class inherits: a name replaces the inherited one, and
 * attributes are merged into the inherited ones.
 */
export function markClass(
  target: ClassType,
  context: ClassDecoratorContext,
  options: TracedOptions,
  enabled: boolean,
): void {
  if (context.kind !== 'class') {
    throw new Error(
      `[Navios] @${enabled ? 'Traced' : 'Traceable'} cannot be applied to a ${context.kind as string}.`,
    )
  }
  // Method decorators, which run first, may have created the metadata.
  const metadata = getTracedMetadata(context)
  metadata.name = options.name ?? metadata.name
  metadata.attributes = { ...metadata.attributes, ...options.attributes }
  metadata.enabled = enabled
  classes.set(target, metadata)
}
