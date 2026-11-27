/**
 * One signal that aborts when either does, with the reason of the one that
 * did. `AbortSignal.any` where the runtime has it.
 */
function either(first: AbortSignal, second: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([first, second])
  const controller = new AbortController()
  for (const signal of [first, second]) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    })
  }
  return controller.signal
}

/**
 * Call arguments with TanStack's signal, which aborts when the query is
 * cancelled or its last observer leaves. A `signal` of the caller's own is
 * combined with it instead of replacing it.
 */
export function withQuerySignal<Args extends object | undefined>(
  signal: AbortSignal,
  args: Args,
): NonNullable<Args> & { signal: AbortSignal } {
  const own = (args as { signal?: unknown } | undefined)?.signal
  return { ...args, signal: own instanceof AbortSignal ? either(signal, own) : signal } as never
}
