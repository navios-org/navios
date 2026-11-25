import { BasicExecutionContext } from '@navios/core/transport'

import type { ExecutionContext } from '@navios/core'
import type { BasicExecutionContextInit } from '@navios/core/transport'
import type { BaseMessageConfig } from '@navios/queues'

export interface MessageContextInit extends Omit<BasicExecutionContextInit, 'kind'> {
  message: BaseMessageConfig
  payload: unknown
  raw: unknown
}

/**
 * The context of one message being handled.
 */
export class MessageContext extends BasicExecutionContext {
  /** The declaration of the message: its pattern, topic or queue, schemas. */
  readonly message: BaseMessageConfig
  /** The payload, as delivered until it has been validated, then parsed. */
  payload: unknown
  /** What the broker delivered, when it is more than the payload. */
  readonly raw: unknown

  constructor(init: MessageContextInit) {
    super({ ...init, kind: 'message' })
    this.message = init.message
    this.payload = init.payload
    this.raw = init.raw
  }
}

/**
 * Whether a context belongs to a message. A guard or interceptor attached to
 * a module or to the whole application runs on every transport; this is how
 * it reaches the message when there is one.
 */
export function isMessageContext(ctx: ExecutionContext): ctx is MessageContext {
  return ctx instanceof MessageContext
}
