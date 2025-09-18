import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'

import type { AbstractHttpAdapterInterface } from '../../index.mjs'
import type { LoggerService, LogLevel } from '../../logger/index.mjs'

export interface FastifyApplicationOptions
  extends Omit<FastifyServerOptions, 'logger'> {
  /**
   * Specifies the logger to use.  Pass `false` to turn off logging.
   */
  logger?: LoggerService | LogLevel[] | false
}

export interface FastifyApplicationServiceInterface
  extends AbstractHttpAdapterInterface<
    FastifyInstance,
    FastifyCorsOptions,
    FastifyApplicationOptions,
    FastifyMultipartOptions
  > {
  createHttpServer(options: FastifyApplicationOptions): Promise<FastifyInstance>
  initServer(): Promise<void>
  ready(): Promise<void>
  getServer(): FastifyInstance
  setGlobalPrefix(prefix: string): void
  enableCors(options: FastifyCorsOptions): void
  enableMultipart(options: FastifyMultipartOptions): void
  listen(options: FastifyListenOptions): Promise<string>
  dispose(): Promise<void>
}
