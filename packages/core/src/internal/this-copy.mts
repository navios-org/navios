/**
 * Registers this copy of the package. Every entry point imports this module,
 * so a copy is noticed whichever entry is loaded, and counted once: the
 * entries of one build share this module.
 */
import { registerCopy } from './single-copy.mjs'

registerCopy(import.meta.url, (message) => console.warn(message))
