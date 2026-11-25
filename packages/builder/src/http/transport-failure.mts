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

/** Codes axios and @navios/http give a request they could not build. Nothing was sent. */
const CONFIG_CODES: ReadonlySet<string | undefined> = new Set([
  'ERR_BAD_OPTION',
  'ERR_BAD_OPTION_VALUE',
  'ERR_INVALID_URL',
])

/**
 * Classifies a rejection that carries no HTTP response.
 *
 * Timeouts are checked first because `AbortSignal.timeout()` also leaves the
 * signal in the aborted state.
 */
export function classifyTransportFailure(
  error: unknown,
  signal: AbortSignal | null | undefined,
): 'timeout' | 'aborted' | 'config' | 'network' {
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
  return CONFIG_CODES.has(code) ? 'config' : 'network'
}
