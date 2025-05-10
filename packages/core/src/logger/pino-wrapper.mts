import type { LoggerService } from './logger-service.interface.mjs'

import { LoggerInstance } from './logger.service.mjs'

export class PinoWrapper {
  constructor(protected readonly logger: LoggerService) {}

  fatal(message: any, ...optionalParams: any[]) {
    if (this.logger.fatal === undefined) {
      return this.error(message, ...optionalParams)
    }
    this.logger.fatal(message, ...optionalParams)
  }

  error(message: any, ...optionalParams: any[]) {
    this.logger.error(message, ...optionalParams)
  }

  warn(message: any, ...optionalParams: any[]) {
    this.logger.warn(message, ...optionalParams)
  }

  info(message: any, ...optionalParams: any[]) {
    this.logger.log(message, ...optionalParams)
  }

  debug(message: any, ...optionalParams: any[]) {
    this.logger.debug?.(message, ...optionalParams)
  }

  trace(message: any, ...optionalParams: any[]) {
    this.logger.verbose?.(message, ...optionalParams)
  }

  silent(message: any, ...optionalParams: any[]) {
    // noop
  }

  child(options: any) {
    const keys = Object.keys(options)
    // @ts-expect-error We don't need to support this in the current version
    let newContext = this.logger['context'] ?? ''
    if (keys.length > 1) {
      // @ts-expect-error We don't need to support this in the current version
      newContext = `${this.logger['context'] ?? ''}:${JSON.stringify(options)}`
    }
    return new PinoWrapper(
      // @ts-expect-error We don't need to support this in the current version
      new LoggerInstance(newContext, this.logger['options']),
    )
  }

  get level(): any {
    if ('level' in this.logger && this.logger.level) {
      return this.logger.level
    }
    const levels = LoggerInstance['logLevels']
    if (levels) {
      return levels[0]
    }
    return 'info'
  }
}
