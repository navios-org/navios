import type { LogLevel } from '../log-levels.mjs'

import { LOG_LEVELS } from '../log-levels.mjs'
import { isLogLevel } from './is-log-level.util.mjs'

/**
 * @publicApi
 */
export function filterLogLevels(parseableString = ''): LogLevel[] {
  const sanitizedString = parseableString.replaceAll(' ', '').toLowerCase()

  if (sanitizedString[0] === '>') {
    const orEqual = sanitizedString[1] === '='

    const logLevelIndex = (LOG_LEVELS as string[]).indexOf(
      sanitizedString.substring(orEqual ? 2 : 1),
    )

    if (logLevelIndex === -1) {
      throw new Error(`parse error (unknown log level): ${sanitizedString}`)
    }

    return LOG_LEVELS.slice(orEqual ? logLevelIndex : logLevelIndex + 1)
  } else if (sanitizedString.includes(',')) {
    return sanitizedString.split(',').filter(isLogLevel)
  }

  return isLogLevel(sanitizedString) ? [sanitizedString] : LOG_LEVELS
}
