import type { LogLevel } from '../log-levels.mjs'

import { LOG_LEVELS } from '../log-levels.mjs'

/**
 * @publicApi
 */
export function isLogLevel(maybeLogLevel: any): maybeLogLevel is LogLevel {
  return LOG_LEVELS.includes(maybeLogLevel)
}
