/** The `metadata` of a decorator context. */
export type DecoratorMetadata = Record<PropertyKey, unknown>

/**
 * The value stored in decorator metadata under `key`, created for this class
 * from what a parent class has, if anything. The metadata object of a class
 * inherits from that of its parent, so writing to an inherited value would
 * change the parent.
 */
export function ownMetadata<T>(
  metadata: DecoratorMetadata,
  key: symbol,
  create: (inherited?: T) => T,
): T {
  if (!Object.hasOwn(metadata, key)) {
    metadata[key] = create(metadata[key] as T | undefined)
  }
  return metadata[key] as T
}

/** The metadata of a decorator context, which has to have one. */
export function requireMetadata(context: { metadata?: DecoratorMetadata }): DecoratorMetadata {
  if (!context.metadata) {
    throw new Error(
      '[Navios] Decorator metadata is not available. Use standard decorators, or the ' +
        '@navios/core/legacy-compat entry point with experimentalDecorators.',
    )
  }
  return context.metadata
}
