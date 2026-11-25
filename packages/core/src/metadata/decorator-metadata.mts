/** The `metadata` of a decorator context. */
export type DecoratorMetadata = Record<PropertyKey, unknown>

/**
 * Returns a value stored in decorator metadata under `key`, creating it for
 * this class if it only exists on a parent. Decorator metadata objects
 * inherit from the parent class's, so writing through an inherited value
 * would change the parent.
 * @internal
 */
export function own<T>(metadata: DecoratorMetadata, key: symbol, create: (inherited?: T) => T): T {
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
