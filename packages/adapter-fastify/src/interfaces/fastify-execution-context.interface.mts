import type {
  AbstractExecutionContext,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

export class FastifyExecutionContext implements AbstractExecutionContext {
  constructor(
    private readonly module: ModuleMetadata,
    private readonly controller: ControllerMetadata,
    private readonly handler: HandlerMetadata,
    private readonly request: FastifyRequest,
    private readonly reply: FastifyReply,
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

  getRequest(): FastifyRequest {
    if (!this.request) {
      throw new Error(
        '[Navios] Request is not set. Make sure to set it before using it.',
      )
    }
    return this.request
  }

  getReply(): FastifyReply {
    if (!this.reply) {
      throw new Error(
        '[Navios] Reply is not set. Make sure to set it before using it.',
      )
    }
    return this.reply
  }
}
