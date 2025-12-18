/**
 * Browser-specific entry point for @navios/di.
 *
 * This entry point forces the use of SyncLocalStorage instead of
 * Node's AsyncLocalStorage, making it safe for browser environments.
 *
 * The browser build is automatically selected by bundlers that respect
 * the "browser" condition in package.json exports.
 */

// Force sync mode before any other imports initialize the storage
import { __testing__ } from './internal/context/async-local-storage.mjs'
__testing__.forceSyncMode()

// Re-export everything from the main entry
export * from './index.mjs'
