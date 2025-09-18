import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '../metadata/index.mjs'

export interface AbstractExecutionContext {
  getModule(): ModuleMetadata
  getController(): ControllerMetadata
  getHandler(): HandlerMetadata
  getRequest(): any
  getReply(): any
  provideRequest(request: any): void
  provideReply(reply: any): void
}
