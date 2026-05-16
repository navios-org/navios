import { Logger } from '@navios/core'
import { Container, Inject, Injectable } from '@navios/di'

import type { LoggerInstance } from '@navios/core'

@Injectable()
export class PinoWrapper {
  @Inject(Container)
  protected accessor container!: Container
  @Inject(Logger)
  protected accessor logger!: LoggerInstance

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
    // MUST be `new PinoWrapper()`, NOT `Object.create(PinoWrapper.prototype)`.
    // Under @navios/di v2, `container`/`logger` are stage-3 `@Inject accessor`
    // fields whose private backing storage is branded by the constructor.
    // An `Object.create`d (constructor-skipped) instance is unbranded, so the
    // manual setter writes below throw `TypeError: Cannot write to private
    // field`. Manual injection here is intentional (child is not container-
    // resolved) and works because the setters accept writes once branded.
    const newPinoWrapper = new PinoWrapper()
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
