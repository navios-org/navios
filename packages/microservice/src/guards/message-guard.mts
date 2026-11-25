import type { MessageExecutionContext } from './message-execution-context.mjs'

/**
 * A guard for message handlers.
 *
 * The microservice runtime is not implemented yet. When it is, guards are
 * meant to converge on `Guard` from `@navios/core`, with a message context
 * that shares the request context's slot API, so that one guard can protect
 * HTTP routes and message handlers alike.
 */
export interface MessageGuard {
  canActivate(context: MessageExecutionContext): boolean | Promise<boolean>
}
