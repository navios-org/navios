// Main module exports - organized by domain
export * from './common/index.mjs'
export * from './query/index.mjs'
export * from './mutation/index.mjs'
export * from './client/index.mjs'

// ============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// ============================================================================
// These exports maintain compatibility with the previous flat structure.
// They are deprecated and will be removed in a future major version.

// Re-export old function names
export { makeQueryOptions } from './query/make-options.mjs'
export { makeInfiniteQueryOptions } from './query/make-infinite-options.mjs'
export { makeMutation } from './mutation/make-hook.mjs'

// Re-export legacy key creator names
export {
  createQueryKey,
  /** @deprecated Use createQueryKey instead */
  queryKeyCreator,
} from './query/key-creator.mjs'
export {
  createMutationKey,
  /** @deprecated Use createMutationKey instead */
  mutationKeyCreator,
} from './mutation/key-creator.mjs'
