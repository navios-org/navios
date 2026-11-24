import { callErrorHook } from '../errors/call-error-hook.mjs'
import { EventSourceError } from '../errors/eventsource-error.mjs'

import type { EventSourceErrorInit } from '../errors/eventsource-error.mjs'

/**
 * Creates an {@link EventSourceError} and passes it to the `onError` hook.
 *
 * The hook is for telemetry: an exception thrown inside it is caught and
 * logged, so it can never break event handling.
 */
export function reportEventSourceError(
  onError: ((error: EventSourceError) => void) | undefined,
  init: EventSourceErrorInit,
): EventSourceError {
  const error = new EventSourceError(init)
  callErrorHook(onError, error, 'Navios-EventSource')
  return error
}
