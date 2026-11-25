import type { ClassType } from '@navios/di'
import type { AttributeValue } from '@opentelemetry/api'

/**
 * Symbol used to store traced metadata on classes and in context.metadata.
 */
export const TracedMetadataKey = Symbol('navios:traced:metadata')

/**
 * @deprecated Use TracedMetadataKey instead
 */
export const TRACED_METADATA_KEY = TracedMetadataKey

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

  const existingMetadata = context.metadata[TracedMetadataKey] as ClassTracedMetadata | undefined

  if (existingMetadata) {
    // For class decorators, ensure metadata is stored on target for runtime extraction
    // This handles the case where method decorators created the metadata first
    if (target) {
      // @ts-expect-error Store on target for extraction later
      target[TracedMetadataKey] = existingMetadata
    }
    return existingMetadata
  }

  const newMetadata: ClassTracedMetadata = {
    name: undefined,
    attributes: undefined,
    enabled: false,
    methods: new Map(),
  }

  context.metadata[TracedMetadataKey] = newMetadata

  // For class decorators, also store on target for runtime extraction
  if (target) {
    // @ts-expect-error Store on target for extraction later
    target[TracedMetadataKey] = newMetadata
  }

  return newMetadata
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
