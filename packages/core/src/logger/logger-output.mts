import { InjectionToken } from '@navios/di'

import type { LogLevel } from './log-levels.mjs'

/**
 * @publicApi
 */
export interface LoggerService {
  /**
   * Write a 'log' level log.
   */
  log(message: any, ...optionalParams: any[]): any

  /**
   * Write an 'error' level log.
   */
  error(message: any, ...optionalParams: any[]): any

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, ...optionalParams: any[]): any

  /**
   * Write a 'debug' level log.
   */
  debug?(message: any, ...optionalParams: any[]): any

  /**
   * Write a 'verbose' level log.
   */
  verbose?(message: any, ...optionalParams: any[]): any

  /**
   * Write a 'fatal' level log.
   */
  fatal?(message: any, ...optionalParams: any[]): any

  /**
   * Set log levels.
   * @param levels log levels
   */
  setLogLevels?(levels: LogLevel[]): any
}

/**
 * Injection token for the logger output service.
 *
 * This token is used to provide a custom logger implementation.
 * By default, it's bound to ConsoleLogger.
 */
export const LoggerOutput = InjectionToken.create<LoggerService>('LoggerOutput')
