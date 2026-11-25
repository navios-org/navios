import { asyncInjectImpl, injectImpl, optionalImpl } from '../internal/inject-impl.mjs'

import type { AsyncResolve, OptionalResolve, SyncResolve } from './resolve-signatures.mjs'

/**
 * Injects a dependency while a class is being constructed (in a field
 * initialiser or the constructor).
 *
 * Returns the real instance whenever it can be built synchronously, including
 * transients (each call gets its own instance).
 */
export const inject: SyncResolve = injectImpl

/**
 * Like `inject`, but returns `null` when nothing provides the token. Any
 * other failure, such as a constructor that throws, propagates.
 */
export const optional: OptionalResolve = optionalImpl

/**
 * Injects a dependency as a promise. It starts resolving after the current
 * construction has returned, so it can be used to break a circular dependency
 * deliberately.
 */
export const asyncInject: AsyncResolve = asyncInjectImpl as AsyncResolve
