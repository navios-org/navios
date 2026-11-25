function errorName(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'name' in value
    ? String(value.name)
    : undefined
}

function errorCode(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'code' in value
    ? String(value.code)
    : undefined
}

/**
 * Classifies a rejection that carries no HTTP response.
 *
 * Timeouts are checked first because `AbortSignal.timeout()` also leaves the
 * signal in the aborted state.
 */
export function classifyTransportFailure(
  error: unknown,
  signal: AbortSignal | null | undefined,
): 'timeout' | 'aborted' | 'network' {
  const name = errorName(error)
  const code = errorCode(error)
  if (
    name === 'TimeoutError' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    (signal?.aborted && errorName(signal.reason) === 'TimeoutError')
  ) {
    return 'timeout'
  }
  if (name === 'AbortError' || code === 'ERR_CANCELED' || signal?.aborted) {
    return 'aborted'
  }
  return 'network'
}
