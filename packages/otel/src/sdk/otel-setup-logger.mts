/**
 * The part of a logger the setup service writes to.
 */
export interface OtelSetupLogger {
  debug(message: string): void
  warn(message: string): void
  error(message: string, ...rest: unknown[]): void
}
