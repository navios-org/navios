import type { ClassType } from '@navios/di'
import type { AttributeValue } from '@opentelemetry/api'

/**
 * Symbol used to store traced metadata on classes and in context.metadata.
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

/**
 * Gets or creates traced metadata during decoration.
 * Used inside decorators with access to context.metadata.
 *
 * For class decorators, also stores on target for runtime extraction.
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
  if (!context.metadata) {
    throw new Error('[Navios] Wrong environment.')
  }

  // A subclass starts from a copy: the metadata object of its base class is the
  // prototype of its own, and other subclasses share it.
  if (!Object.hasOwn(context.metadata, TracedMetadataKey)) {
    const inherited = context.metadata[TracedMetadataKey] as ClassTracedMetadata | undefined
    context.metadata[TracedMetadataKey] = {
      name: undefined,
      attributes: undefined,
      enabled: false,
      ...inherited,
      methods: new Map(inherited?.methods),
    } satisfies ClassTracedMetadata
  }
  const metadata = context.metadata[TracedMetadataKey] as ClassTracedMetadata

  // For class decorators, also store on target for runtime extraction. Method
  // decorators, which run first, may have created the metadata.
  if (target) {
    // @ts-expect-error Store on target for extraction later
    target[TracedMetadataKey] = metadata
  }

  return metadata
}

/**
 * Extracts traced metadata from an already-decorated class.
 * Used at runtime when context is not available.
 *
 * @param target - The decorated class
 * @returns The class traced metadata
 * @throws Error if metadata not found
 */
export function extractTracedMetadata(target: ClassType): ClassTracedMetadata {
  // @ts-expect-error We store metadata directly on target
  const metadata = target[TracedMetadataKey] as ClassTracedMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios] Traced metadata not found. Make sure to use @Traceable or @Traced decorator.',
    )
  }
  return metadata
}

/**
 * Checks if a class has traced metadata.
 *
 * @param target - The class to check
 * @returns True if the class has traced metadata
 */
export function hasTracedMetadata(target: ClassType): boolean {
  // @ts-expect-error We store metadata directly on target
  return !!target[TracedMetadataKey]
}
