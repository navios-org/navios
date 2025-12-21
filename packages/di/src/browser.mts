/**
 * Browser-specific entry point for @navios/di.
 *
 * This entry point is automatically selected by bundlers that respect
 * the "browser" condition in package.json exports.
 *
 * The browser build uses SyncLocalStorage instead of Node's AsyncLocalStorage,
 * which is sufficient for synchronous DI resolution in browser environments.
 */

export * from './index.mjs'
