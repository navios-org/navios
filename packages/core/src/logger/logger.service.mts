import { Injectable } from '@navios/di'

import type { LogLevel } from './log-levels.mjs'
import type { LoggerService } from './logger-service.interface.mjs'

import { ConsoleLogger } from './console-logger.service.mjs'
import { isLogLevelEnabled, isObject } from './utils/index.mjs'

const DEFAULT_LOGGER = new ConsoleLogger()

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  day: '2-digit',
  month: '2-digit',
})

@Injectable()
export class LoggerInstance implements LoggerService {
  protected static staticInstanceRef?: LoggerService = DEFAULT_LOGGER
  protected static logLevels?: LogLevel[]

  protected localInstanceRef?: LoggerService

  constructor()
  constructor(context: string)
  constructor(context: string, options?: { timestamp?: boolean })
  constructor(
    protected context?: string,
    protected options: { timestamp?: boolean } = {},
  ) {}

  get localInstance(): LoggerService {
    if (LoggerInstance.staticInstanceRef === DEFAULT_LOGGER) {
      return this.registerLocalInstanceRef()
    } else if (LoggerInstance.staticInstanceRef instanceof LoggerInstance) {
      const prototype = Object.getPrototypeOf(LoggerInstance.staticInstanceRef)
      if (prototype.constructor === LoggerInstance) {
        return this.registerLocalInstanceRef()
      }
    }
    return LoggerInstance.staticInstanceRef!
  }

  /**
   * Write an 'error' level log.
   */
  error(message: any, stack?: string, context?: string): void
  error(message: any, ...optionalParams: [...any, string?, string?]): void
  error(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? (optionalParams.length ? optionalParams : [undefined]).concat(
          this.context,
        )
      : optionalParams

    this.localInstance?.error(message, ...optionalParams)
  }

  /**
   * Write a 'log' level log.
   */
  log(message: any, context?: string): void
  log(message: any, ...optionalParams: [...any, string?]): void
  log(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.log(message, ...optionalParams)
  }

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, context?: string): void
  warn(message: any, ...optionalParams: [...any, string?]): void
  warn(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.warn(message, ...optionalParams)
  }

  /**
   * Write a 'debug' level log.
   */
  debug(message: any, context?: string): void
  debug(message: any, ...optionalParams: [...any, string?]): void
  debug(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.debug?.(message, ...optionalParams)
  }

  /**
   * Write a 'verbose' level log.
   */
  verbose(message: any, context?: string): void
  verbose(message: any, ...optionalParams: [...any, string?]): void
  verbose(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.verbose?.(message, ...optionalParams)
  }

  /**
   * Write a 'fatal' level log.
   */
  fatal(message: any, context?: string): void
  fatal(message: any, ...optionalParams: [...any, string?]): void
  fatal(message: any, ...optionalParams: any[]) {
    optionalParams = this.context
      ? optionalParams.concat(this.context)
      : optionalParams
    this.localInstance?.fatal?.(message, ...optionalParams)
  }

  /**
   * Write an 'error' level log.
   */
  static error(message: any, stackOrContext?: string): void
  static error(message: any, context?: string): void
  static error(message: any, stack?: string, context?: string): void
  static error(
    message: any,
    ...optionalParams: [...any, string?, string?]
  ): void
  static error(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.error(message, ...optionalParams)
  }

  /**
   * Write a 'log' level log.
   */
  static log(message: any, context?: string): void
  static log(message: any, ...optionalParams: [...any, string?]): void
  static log(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.log(message, ...optionalParams)
  }

  /**
   * Write a 'warn' level log.
   */
  static warn(message: any, context?: string): void
  static warn(message: any, ...optionalParams: [...any, string?]): void
  static warn(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.warn(message, ...optionalParams)
  }

  /**
   * Write a 'debug' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  static debug(message: any, context?: string): void
  static debug(message: any, ...optionalParams: [...any, string?]): void
  static debug(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.debug?.(message, ...optionalParams)
  }

  /**
   * Write a 'verbose' level log.
   */
  static verbose(message: any, context?: string): void
  static verbose(message: any, ...optionalParams: [...any, string?]): void
  static verbose(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.verbose?.(message, ...optionalParams)
  }

  /**
   * Write a 'fatal' level log.
   */
  static fatal(message: any, context?: string): void
  static fatal(message: any, ...optionalParams: [...any, string?]): void
  static fatal(message: any, ...optionalParams: any[]) {
    this.staticInstanceRef?.fatal?.(message, ...optionalParams)
  }

  static getTimestamp() {
    return dateTimeFormatter.format(Date.now())
  }

  static overrideLogger(logger: LoggerService | LogLevel[] | boolean) {
    if (Array.isArray(logger)) {
      LoggerInstance.logLevels = logger
      return this.staticInstanceRef?.setLogLevels?.(logger)
    }
    if (isObject(logger)) {
      this.staticInstanceRef = logger as LoggerService
    } else {
      this.staticInstanceRef = undefined
    }
  }

  static isLevelEnabled(level: LogLevel): boolean {
    const logLevels = LoggerInstance.logLevels
    return isLogLevelEnabled(level, logLevels)
  }

  private registerLocalInstanceRef() {
    if (this.localInstanceRef) {
      return this.localInstanceRef
    }
    this.localInstanceRef = new ConsoleLogger(this.context!, {
      timestamp: this.options?.timestamp,
      logLevels: LoggerInstance.logLevels,
    })
    return this.localInstanceRef
  }
}
