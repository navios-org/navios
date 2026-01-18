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
