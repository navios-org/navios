import type {
  AbstractHttpAdapterInterface,
  LoggerService,
  LogLevel,
} from '@navios/core'
import type { ServeOptions, Server } from 'bun'

export interface BunApplicationOptions extends ServeOptions {
  /**
   * Specifies the logger to use. Pass `false` to turn off logging.
   */
  logger?: LoggerService | LogLevel[] | false
}

export interface BunApplicationServiceInterface
  extends AbstractHttpAdapterInterface<
    Server,
    never, // No CORS support for now
    BunApplicationOptions,
    never // No multipart support for now
  > {
  setupHttpServer(options: BunApplicationOptions): Promise<void>
  initServer(): Promise<void>
  ready(): Promise<void>
  getServer(): Server
  setGlobalPrefix(prefix: string): void
  enableCors(options: never): void
  enableMultipart(options: never): void
  listen(options: BunListenOptions): Promise<string>
  dispose(): Promise<void>
}

export interface BunListenOptions {
  port?: number
  hostname?: string
}
