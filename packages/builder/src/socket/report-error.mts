import { callErrorHook } from '../errors/call-error-hook.mjs'
import { SocketError } from '../errors/socket-error.mjs'

import type { SocketErrorInit } from '../errors/socket-error.mjs'

/**
 * Creates a {@link SocketError} and passes it to the `onError` hook.
 *
 * The hook is for telemetry: an exception thrown inside it is caught and
 * logged, so it can never break message handling.
 */
export function reportSocketError(
  onError: ((error: SocketError) => void) | undefined,
  init: SocketErrorInit,
): SocketError {
  const error = new SocketError(init)
  callErrorHook(onError, error, 'Navios-Socket')
  return error
}
