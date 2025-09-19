import type { ModuleMetadata } from '../metadata/index.mjs'
import type { AbstractHttpCorsOptions } from './abstract-http-cors-options.interface.mjs'
import type { AbstractHttpListenOptions } from './abstract-http-listen-options.interface.mjs'

export interface AbstractHttpAdapterInterface<
  ServerInstance,
  CorsOptions = AbstractHttpCorsOptions,
  Options = {},
  MultipartOptions = {},
> {
  setupHttpServer(options: Options): Promise<void>
  onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void>
  ready(): Promise<void>
  getServer(): ServerInstance
  setGlobalPrefix(prefix: string): void
  enableCors(options: CorsOptions): void
  enableMultipart(options: MultipartOptions): void
  listen(options: AbstractHttpListenOptions): Promise<string>
  dispose(): Promise<void>
}
