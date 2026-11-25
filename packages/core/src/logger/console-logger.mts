// Ported from NestJS (https://github.com/nestjs/nest, MIT licence). Big thanks
// to the NestJS team for their work.
import type { InspectOptions } from 'util'
import { inspect } from 'util'

import { registerInjectable } from '@navios/di'

import { currentContext } from '../execution/async-context.mjs'

import { clc, yellow } from './cli-colors.mjs'
import { isLogLevelEnabled, LOG_LEVELS } from './log-levels.mjs'
import { LoggerOutput } from './logger-output.mjs'
import { isFunction, isPlainObject, isString, isUndefined } from './type-guards.mjs'

import type { ConsoleLoggerOptions } from './console-logger-options.mjs'
import type { LogLevel } from './log-levels.mjs'
import type { LoggerService } from './logger-output.mjs'

const DEFAULT_DEPTH = 5

/** Every level, and `log` and above in production. */
function defaultLogLevels(): LogLevel[] {
  return process.env.NODE_ENV === 'production'
    ? LOG_LEVELS.slice(LOG_LEVELS.indexOf('log'))
    : [...LOG_LEVELS]
}

interface JsonError {
  name: string
  message: string
  stack?: string
  cause?: unknown
  /** What the error itself carries: `code`, `status`, `detail`. */
  [field: string]: unknown
}

/** Has a place of its own, or stands on the prototype in most errors. */
const commonFields = new Set(['name', 'message', 'stack', 'cause'])

/**
 * An error as JSON shows it. `encode` gives the value to show for one that is
 * not an error.
 */
function toJsonError(
  error: Error,
  encode: (value: unknown) => unknown,
  path: unknown[] = [],
): JsonError {
  const inside = [...path, error]
  const showOne = (value: unknown): unknown => {
    if (inside.includes(value)) {
      return '[Circular]'
    }
    return value instanceof Error ? toJsonError(value, encode, inside) : encode(value)
  }
  const show = (value: unknown) => (Array.isArray(value) ? value.map(showOne) : showOne(value))
  const { name, message, stack, cause } = error
  const described: JsonError = { name, message, stack }
  if (cause !== undefined) {
    described.cause = show(cause)
  }
  if (error instanceof AggregateError) {
    described.errors = show(error.errors)
  }
  for (const field of Object.keys(error)) {
    if (!commonFields.has(field)) {
      try {
        described[field] = show((error as unknown as Record<string, unknown>)[field])
      } catch (reason) {
        described[field] = `[cannot be read: ${reason instanceof Error ? reason.message : reason}]`
      }
    }
  }
  return described
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  day: '2-digit',
  month: '2-digit',
})

function withoutUndefined(options: ConsoleLoggerOptions = {}): ConsoleLoggerOptions {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
}

/**
 * Prints to the console. Without options it prints every level, `log` and
 * above when `NODE_ENV` is `production`, in colour when stdout is a terminal.
 * @publicApi
 */
export class ConsoleLogger implements LoggerService {
  /**
   * Creates a new ConsoleLogger instance with the given options.
   * This is a convenience method that instantiates and sets up the logger in one call.
   */
  static create(): ConsoleLogger
  static create(context: string): ConsoleLogger
  static create(options: ConsoleLoggerOptions): ConsoleLogger
  static create(context: string, options: ConsoleLoggerOptions): ConsoleLogger
  static create(
    contextOrOptions?: string | ConsoleLoggerOptions,
    options?: ConsoleLoggerOptions,
  ): ConsoleLogger {
    return new this(contextOrOptions as string, options as ConsoleLoggerOptions)
  }

  /**
   * The options in effect: those given so far, and the defaults.
   */
  protected options: ConsoleLoggerOptions = {}
  /**
   * The context of the logger (can be set manually or automatically inferred).
   */
  protected context?: string
  /**
   * The original context of the logger (set by the constructor or `setup`).
   */
  protected originalContext?: string
  /**
   * The options used for the "inspect" method.
   */
  protected inspectOptions: InspectOptions = {}
  /**
   * The last timestamp at which the log message was printed.
   */
  protected lastTimestampAt?: number
  /**
   * The options that were given.
   */
  private given: ConsoleLoggerOptions = {}

  constructor()
  constructor(context: string)
  constructor(options: ConsoleLoggerOptions)
  constructor(context: string, options: ConsoleLoggerOptions)
  constructor(contextOrOptions?: string | ConsoleLoggerOptions, options?: ConsoleLoggerOptions) {
    this.setup(contextOrOptions as string, options as ConsoleLoggerOptions)
  }

  /**
   * Changes the options that are given and leaves the others as they are.
   */
  setup(): void
  setup(context: string): void
  setup(options: ConsoleLoggerOptions): void
  setup(context: string, options: ConsoleLoggerOptions): void
  setup(contextOrOptions?: string | ConsoleLoggerOptions, options?: ConsoleLoggerOptions) {
    const [context, opts] = isString(contextOrOptions)
      ? [contextOrOptions, options]
      : options
        ? [undefined, options]
        : [contextOrOptions?.context, contextOrOptions]

    this.applyOptions({ ...this.given, ...withoutUndefined(opts) })

    if (context) {
      this.context = context
      this.originalContext = context
    }
  }

  /**
   * Like `setup`, for the options that were not given.
   * @internal
   */
  setDefaults(options: ConsoleLoggerOptions): void {
    this.applyOptions({ ...options, ...this.given })
  }

  private applyOptions(given: ConsoleLoggerOptions): void {
    this.given = given
    this.options = {
      ...given,
      logLevels: given.logLevels ?? defaultLogLevels(),
      colors: given.colors ?? (!given.json && process.stdout.isTTY === true),
      prefix: given.prefix ?? 'Navios',
    }
    this.inspectOptions = this.getInspectOptions()
  }

  /**
   * Write a 'log' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  log(message: any, context?: string): void
  log(message: any, ...optionalParams: [...any, string?]): void
  log(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('log')) {
      return
    }
    const { messages, context } = this.getContextAndMessagesToPrint([message, ...optionalParams])
    this.printMessages(messages, context, 'log')
  }

  /**
   * Write an 'error' level log, if the configured level allows for it.
   * Prints to `stderr` with newline.
   */
  error(message: any, stackOrContext?: string): void
  error(message: any, stack?: string, context?: string): void
  error(message: any, ...optionalParams: [...any, string?, string?]): void
  error(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('error')) {
      return
    }
    const { messages, context, stack } = this.getContextAndStackAndMessagesToPrint([
      message,
      ...optionalParams,
    ])

    this.printMessages(messages, context, 'error', undefined, 'stderr', stack)
    this.printStackTrace(stack as string)
  }

  /**
   * Write a 'warn' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  warn(message: any, context?: string): void
  warn(message: any, ...optionalParams: [...any, string?]): void
  warn(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('warn')) {
      return
    }
    const { messages, context } = this.getContextAndMessagesToPrint([message, ...optionalParams])
    this.printMessages(messages, context, 'warn')
  }

  /**
   * Write a 'debug' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  debug(message: any, context?: string): void
  debug(message: any, ...optionalParams: [...any, string?]): void
  debug(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('debug')) {
      return
    }
    const { messages, context } = this.getContextAndMessagesToPrint([message, ...optionalParams])
    this.printMessages(messages, context, 'debug')
  }

  /**
   * Write a 'verbose' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  verbose(message: any, context?: string): void
  verbose(message: any, ...optionalParams: [...any, string?]): void
  verbose(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('verbose')) {
      return
    }
    const { messages, context } = this.getContextAndMessagesToPrint([message, ...optionalParams])
    this.printMessages(messages, context, 'verbose')
  }

  /**
   * Write a 'fatal' level log, if the configured level allows for it.
   * Prints to `stdout` with newline.
   */
  fatal(message: any, context?: string): void
  fatal(message: any, ...optionalParams: [...any, string?]): void
  fatal(message: any, ...optionalParams: any[]) {
    if (!this.isLevelEnabled('fatal')) {
      return
    }
    const { messages, context } = this.getContextAndMessagesToPrint([message, ...optionalParams])
    this.printMessages(messages, context, 'fatal')
  }

  /**
   * Set log levels
   * @param levels log levels
   */
  setLogLevels(levels: LogLevel[]) {
    this.setup({ logLevels: levels })
  }

  /**
   * Set logger context
   * @param context context
   */
  setContext(context: string) {
    this.context = context
  }

  /**
   * Resets the logger context to the value that was passed to the constructor or `setup`.
   */
  resetContext() {
    this.context = this.originalContext
  }

  isLevelEnabled(level: LogLevel): boolean {
    const logLevels = this.options?.logLevels
    return isLogLevelEnabled(level, logLevels)
  }

  /**
   * Gets the current request ID from the AsyncLocalStorage store.
   * Only returns a value if the requestId option is enabled.
   */
  protected getCurrentRequestId(): string | undefined {
    if (!this.options.requestId) {
      return undefined
    }
    return currentContext()?.id
  }

  protected getTimestamp(): string {
    return dateTimeFormatter.format(Date.now())
  }

  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    requestId?: string,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ) {
    const resolvedRequestId = requestId ?? this.getCurrentRequestId()
    if (this.options.json) {
      for (const line of this.toJsonLines(messages)) {
        this.guarded(() =>
          this.printAsJson(line.message, {
            context,
            logLevel,
            writeStreamType,
            errorStack,
            requestId: resolvedRequestId,
            error: line.error,
          }),
        )
      }
      return
    }
    for (const message of messages) {
      this.guarded(() => {
        const pidMessage = this.formatPid(process.pid)
        const contextMessage = this.formatContext(context)
        const timestampDiff = this.updateAndGetTimestampDiff()
        const formattedLogLevel = logLevel.toUpperCase().padStart(7, ' ')
        const formattedMessage = this.formatMessage(
          logLevel,
          message,
          pidMessage,
          formattedLogLevel,
          contextMessage,
          timestampDiff,
          resolvedRequestId,
        )

        process[writeStreamType ?? 'stdout'].write(formattedMessage)
      })
    }
  }

  /** A message and the error logged with it share a line. */
  private toJsonLines(messages: unknown[]): Array<{ message: unknown; error?: Error }> {
    const lines: Array<{ message: unknown; error?: Error }> = []
    for (const message of messages) {
      const last = lines.at(-1)
      if (!(message instanceof Error)) {
        lines.push({ message })
      } else if (last && !last.error) {
        last.error = message
      } else {
        lines.push({ message: message.message, error: message })
      }
    }
    return lines
  }

  /** Logging must not fail the code that logs. */
  private guarded(print: () => void): void {
    try {
      print()
    } catch (error) {
      try {
        const reason = error instanceof Error ? error.message : String(error)
        process.stderr.write(`[Navios] A log message could not be printed: ${reason}\n`)
      } catch {
        // There is nothing left to tell.
      }
    }
  }

  protected printAsJson(
    message: unknown,
    options: {
      context: string
      logLevel: LogLevel
      writeStreamType?: 'stdout' | 'stderr'
      errorStack?: unknown
      requestId?: string
      error?: Error
    },
  ) {
    type JsonLogObject = {
      level: LogLevel
      pid: number
      timestamp: number
      message: unknown
      context?: string
      stack?: unknown
      requestId?: string
      error?: JsonError
    }

    const logObject: JsonLogObject = {
      level: options.logLevel,
      pid: process.pid,
      timestamp: Date.now(),
      message,
    }

    if (options.context) {
      logObject.context = options.context
    }

    if (options.errorStack) {
      logObject.stack = options.errorStack
    }
    if (this.options.requestId && options.requestId) {
      logObject.requestId = options.requestId
    }
    if (options.error) {
      logObject.error = toJsonError(options.error, (value) => this.encodable(value))
    }

    const formattedMessage =
      !this.options.colors && this.inspectOptions.compact === true
        ? this.stringify(logObject)
        : inspect(logObject, this.inspectOptions)
    process[options.writeStreamType ?? 'stdout'].write(`${formattedMessage}\n`)
  }

  private stringify(logObject: { message: unknown; error?: JsonError }): string {
    const replacer = (key: string, value: unknown) => this.stringifyReplacer(key, value)
    try {
      return JSON.stringify(logObject, replacer)
    } catch {
      // Circular, or with a `toJSON` or a getter that throws.
      const { message, error } = logObject
      return JSON.stringify({
        ...logObject,
        message: typeof message === 'string' ? message : inspect(message, this.inspectOptions),
        error: error && inspect(error, this.inspectOptions),
      })
    }
  }

  /** A field that JSON cannot hold must not cost the rest of an error. */
  private encodable(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) {
      return value
    }
    try {
      JSON.stringify(value, (key, inner) => this.stringifyReplacer(key, inner))
      return value
    } catch {
      return inspect(value, { ...this.inspectOptions, depth: 1 })
    }
  }

  protected formatPid(pid: number) {
    const showPrefix = this.options.showPrefix ?? true
    const showPid = this.options.showPid ?? true

    if (!showPrefix && !showPid) {
      return ''
    }

    const prefix = showPrefix ? `[${this.options.prefix}]` : ''
    const pidPart = showPid ? `${pid}` : ''
    const separator = showPrefix && showPid ? ' ' : ''
    const suffix = showPrefix || showPid ? ' - ' : ''

    return `${prefix}${separator}${pidPart}${suffix}`
  }

  protected formatContext(context: string): string {
    const showContext = this.options.showContext ?? true
    if (!context || !showContext) {
      return ''
    }

    context = `[${context}] `
    return this.options.colors ? yellow(context) : context
  }

  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
    requestId?: string,
  ) {
    const output = this.stringifyMessage(message, logLevel)
    const showLogLevel = this.options.showLogLevel ?? true
    const showTimestamp = this.options.showTimestamp ?? true

    pidMessage = this.colorize(pidMessage, logLevel)
    formattedLogLevel = showLogLevel ? this.colorize(formattedLogLevel, logLevel) : ''

    const timestamp = showTimestamp ? this.getTimestamp() : ''
    const requestIdPart = this.getRequestId(requestId)

    // Build the message parts, filtering out empty ones
    const parts: string[] = []

    if (pidMessage) parts.push(pidMessage.trimEnd())
    if (requestIdPart) parts.push(requestIdPart.trimEnd())
    if (timestamp) parts.push(timestamp)
    if (formattedLogLevel) parts.push(formattedLogLevel)
    if (contextMessage) parts.push(contextMessage.trimEnd())

    const prefix = parts.length > 0 ? parts.join(' ') + ' ' : ''

    return `${prefix}${output}${timestampDiff}\n`
  }

  protected getRequestId(requestId?: string) {
    if (this.options.requestId && requestId) {
      return `(${this.colorize(requestId, 'log')}) `
    }
    return ''
  }

  protected stringifyMessage(message: unknown, logLevel: LogLevel): string {
    if (isFunction(message)) {
      const messageAsStr = Function.prototype.toString.call(message)
      const isClass = messageAsStr.startsWith('class ')
      if (isClass) {
        // If the message is a class, we will display the class name.
        return this.stringifyMessage(message.name, logLevel)
      }
      // If the message is a non-class function, call it and re-resolve its value.
      return this.stringifyMessage(message(), logLevel)
    }

    if (typeof message === 'string') {
      return this.colorize(message, logLevel)
    }

    const outputText = inspect(message, this.inspectOptions)
    if (isPlainObject(message)) {
      return `Object(${Object.keys(message).length}) ${outputText}`
    }
    if (Array.isArray(message)) {
      return `Array(${message.length}) ${outputText}`
    }
    return outputText
  }

  protected colorize(message: string, logLevel: LogLevel) {
    if (!this.options.colors || this.options.json) {
      return message
    }
    const color = this.getColorByLogLevel(logLevel)
    return color(message)
  }

  protected printStackTrace(stack: string) {
    if (!stack || this.options.json) {
      return
    }
    this.guarded(() => process.stderr.write(`${stack}\n`))
  }

  protected updateAndGetTimestampDiff(): string {
    const showTimeDiff = this.options?.showTimeDiff ?? false
    const includeTimestamp = this.lastTimestampAt && showTimeDiff
    const result = includeTimestamp
      ? this.formatTimestampDiff(Date.now() - this.lastTimestampAt!)
      : ''
    this.lastTimestampAt = Date.now()
    return result
  }

  protected formatTimestampDiff(timestampDiff: number) {
    const formattedDiff = ` +${timestampDiff}ms`
    return this.options.colors ? yellow(formattedDiff) : formattedDiff
  }

  protected getInspectOptions() {
    let breakLength = this.options.breakLength
    if (typeof breakLength === 'undefined') {
      breakLength = this.options.colors
        ? this.options.compact
          ? Infinity
          : undefined
        : this.options.compact === false
          ? undefined
          : Infinity // default breakLength to Infinity if inline is not set and colors is false
    }

    const inspectOptions: InspectOptions = {
      depth: this.options.depth ?? DEFAULT_DEPTH,
      sorted: this.options.sorted,
      showHidden: this.options.showHidden,
      compact: this.options.compact ?? (this.options.json ? true : false),
      colors: this.options.colors,
      breakLength,
    }

    if (this.options.maxArrayLength) {
      inspectOptions.maxArrayLength = this.options.maxArrayLength
    }
    if (this.options.maxStringLength) {
      inspectOptions.maxStringLength = this.options.maxStringLength
    }

    return inspectOptions
  }

  protected stringifyReplacer(key: string, value: unknown) {
    // Mimic util.inspect behavior for JSON logger with compact on and colors off
    if (typeof value === 'bigint') {
      return value.toString()
    }
    if (typeof value === 'symbol') {
      return value.toString()
    }

    if (value instanceof Map || value instanceof Set || value instanceof Error) {
      return `${inspect(value, this.inspectOptions)}`
    }
    return value
  }

  private getContextAndMessagesToPrint(args: unknown[]) {
    if (args?.length <= 1) {
      return { messages: args, context: this.context }
    }
    const lastElement = args[args.length - 1]
    const isContext = isString(lastElement)
    if (!isContext) {
      return { messages: args, context: this.context }
    }
    return {
      context: lastElement,
      messages: args.slice(0, args.length - 1),
    }
  }

  private getContextAndStackAndMessagesToPrint(args: unknown[]) {
    if (args.length === 2) {
      const [message, second] = args
      if (isUndefined(second)) {
        return { messages: [message], context: this.context }
      }
      if (!isString(second)) {
        return { messages: args, context: this.context }
      }
      return this.isStackFormat(second)
        ? { messages: [message], stack: second, context: this.context }
        : { messages: [message], context: second }
    }

    const { messages, context } = this.getContextAndMessagesToPrint(args)
    if (messages?.length <= 1) {
      return { messages, context }
    }
    const lastElement = messages[messages.length - 1]
    const isStack = isString(lastElement)
    // https://github.com/nestjs/nest/issues/11074#issuecomment-1421680060
    if (!isStack && !isUndefined(lastElement)) {
      return { messages, context }
    }
    return {
      stack: lastElement,
      messages: messages.slice(0, messages.length - 1),
      context,
    }
  }

  private isStackFormat(stack: string) {
    return /^(.)+\n\s+at .+:\d+:\d+/.test(stack)
  }

  private getColorByLogLevel(level: LogLevel) {
    switch (level) {
      case 'debug':
        return clc.magentaBright
      case 'warn':
        return clc.yellow
      case 'error':
        return clc.red
      case 'verbose':
        return clc.cyanBright
      case 'fatal':
        return clc.bold
      default:
        return clc.green
    }
  }
}

registerInjectable(ConsoleLogger, { token: LoggerOutput })
