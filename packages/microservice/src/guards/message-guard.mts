import type { Guard, Interceptor } from '@navios/core'

import type { MessageContext } from '../context/message-context.mjs'

/** A guard of message handlers. */
export type MessageGuard = Guard<MessageContext>

/** An interceptor around message handlers. */
export type MessageInterceptor = Interceptor<MessageContext, unknown>
