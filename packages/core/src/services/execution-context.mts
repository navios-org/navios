import type { FastifyReply, FastifyRequest } from 'fastify'

import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '../metadata/index.mjs'

export class ExecutionContext {
  private request: FastifyRequest | undefined
  private reply: FastifyReply | undefined
  constructor(
    private readonly module: ModuleMetadata,
    private readonly controller: ControllerMetadata,
    private readonly handler: HandlerMetadata,
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

  provideRequest(request: FastifyRequest): void {
    this.request = request
  }

  provideReply(reply: FastifyReply): void {
    this.reply = reply
  }
}
