/**
 * Available log levels in order of severity (lowest to highest).
 */
export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const satisfies string[]

/**
 * Log level type.
 *
 * Represents the severity level of a log message.
 * Levels are: 'verbose', 'debug', 'log', 'warn', 'error', 'fatal'
 *
 * @publicApi
 */
export type LogLevel = (typeof LOG_LEVELS)[number]

function isLogLevel(maybeLogLevel: any): maybeLogLevel is LogLevel {
  return LOG_LEVELS.includes(maybeLogLevel)
}

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

/**
 * Checks if target level is enabled.
 * @param targetLevel target level
 * @param logLevels array of enabled log levels
 */
export function isLogLevelEnabled(
  targetLevel: LogLevel,
  logLevels: LogLevel[] | undefined,
): boolean {
  if (!logLevels || (Array.isArray(logLevels) && logLevels?.length === 0)) {
    return false
  }
  if (logLevels.includes(targetLevel)) {
    return true
  }
  const highestLogLevelValue = logLevels
    .map((level) => LOG_LEVEL_VALUES[level])
    .sort((a, b) => b - a)?.[0]

  const targetLevelValue = LOG_LEVEL_VALUES[targetLevel]
  return targetLevelValue >= highestLogLevelValue
}

function requireLogLevel(level: string): LogLevel {
  if (!isLogLevel(level)) {
    throw new Error(`parse error (unknown log level): ${level}`)
  }
  return level
}

/**
 * Reads log levels out of a setting: `'error'`, `'warn,error'`, `'>=warn'` or
 * `'>warn'`. An empty string stands for every level.
 * @publicApi
 */
export function filterLogLevels(parseableString = ''): LogLevel[] {
  const sanitizedString = parseableString.replaceAll(' ', '').toLowerCase()

  if (sanitizedString === '') {
    return [...LOG_LEVELS]
  }
  if (sanitizedString[0] === '>') {
    const orEqual = sanitizedString[1] === '='
    const logLevelIndex = LOG_LEVELS.indexOf(
      requireLogLevel(sanitizedString.substring(orEqual ? 2 : 1)),
    )
    return LOG_LEVELS.slice(orEqual ? logLevelIndex : logLevelIndex + 1)
  }
  return sanitizedString.split(',').map(requireLogLevel)
}
