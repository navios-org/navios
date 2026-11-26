import type { InferInput, StandardSchemaV1 } from '@navios/di'

import { ResponseValidationError } from '../errors/validation-error.mjs'

import type { SseMessage } from './sse-message.mjs'

/**
 * An event declared with the builder's `defineEvent`, or anything with the
 * same `config`.
 */
export interface EventDeclaration<
  Name extends string = string,
  Schema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  config: { eventName: Name; payloadSchema?: Schema }
}

type PayloadOf<Event extends EventDeclaration> =
  Event['config']['payloadSchema'] extends StandardSchemaV1
    ? InferInput<Event['config']['payloadSchema']>
    : unknown

/**
 * Creates an event for a declared event type. The payload is typed from the
 * declaration's `payloadSchema` and validated against it.
 *
 * ```ts
 * yield sse(userJoined, { userId: '1' })
 * ```
 */
export function sse<Event extends EventDeclaration>(
  event: Event,
  payload: PayloadOf<Event>,
  options: { id?: string; retry?: number } = {},
): SseMessage {
  const { eventName, payloadSchema } = event.config
  let data: unknown = payload
  if (payloadSchema) {
    const result = payloadSchema['~standard'].validate(payload)
    if (result instanceof Promise) {
      result.catch(() => {})
      throw new Error(
        `[Navios] The payload schema of event "${eventName}" must validate synchronously`,
      )
    }
    if (result.issues) {
      throw new ResponseValidationError(result.issues)
    }
    data = result.value
  }
  // A string as well: whoever reads the event by its declaration parses the
  // data, and must not take the text `42` for a number.
  return {
    event: eventName,
    data: typeof data === 'string' ? JSON.stringify(data) : data,
    ...options,
  }
}
