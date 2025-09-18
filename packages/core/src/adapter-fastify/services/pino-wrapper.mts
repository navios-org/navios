import { Container, inject, Injectable } from '@navios/di'

import { Logger } from '../../logger/logger.tokens.mjs'

@Injectable()
export class PinoWrapper {
  protected container = inject(Container)
  protected logger = inject(Logger)

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

  info() {
    // We don't want to populate the logs with the original fastify logs
    // this.logger.debug?.('INFO', message, ...optionalParams)
  }

  debug(message: any, ...optionalParams: any[]) {
    this.logger.debug?.(message, ...optionalParams)
  }

  trace(message: any, ...optionalParams: any[]) {
    this.logger.verbose?.(message, ...optionalParams)
  }

  silent() {
    // noop
  }

  child(options: any) {
    const keys = Object.keys(options)
    let newContext = this.logger['context'] ?? ''
    if (keys.length > 1) {
      newContext = `${this.logger['context'] ?? ''}:${JSON.stringify(options)}`
    }
    const loggerPromise = this.container.get(Logger, {
      context: newContext,
    })
    const newPinoWrapper = Object.create(PinoWrapper.prototype)
    newPinoWrapper.container = this.container
    newPinoWrapper.logger = this.logger
    loggerPromise.then((logger) => {
      newPinoWrapper.logger = logger
    })
    return newPinoWrapper
  }

  get level(): any {
    if ('level' in this.logger && this.logger.level) {
      return this.logger.level
    }
    if (
      'logLevels' in this.logger &&
      this.logger.logLevels &&
      Array.isArray(this.logger.logLevels)
    ) {
      return this.logger.logLevels.find((level) => level !== 'verbose')
    }
    return 'warn'
  }
}
