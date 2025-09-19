import type {
  AbstractExecutionContext,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'

export class BunExecutionContext implements AbstractExecutionContext {
  constructor(
    private readonly module: ModuleMetadata,
    private readonly controller: ControllerMetadata,
    private readonly handler: HandlerMetadata,
    private readonly request: Request,
  ) {}
  getModule(): ModuleMetadata {
    return this.module
  }

  getController(): ControllerMetadata {
    return this.controller
  }

  getHandler(): HandlerMetadata {
    return this.handler
  }

  getRequest(): Request {
    if (!this.request) {
      throw new Error(
        '[Navios] Request is not set. Make sure to set it before using it.',
      )
    }
    return this.request
  }

  getReply(): never {
    throw new Error('[Navios] Reply is not available in Bun adapter.')
  }
}
