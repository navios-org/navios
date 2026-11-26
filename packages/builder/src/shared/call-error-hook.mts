/**
 * Calls an `onError` hook with the arguments it takes: the error, and for the
 * HTTP builder a context object.
 *
 * Hooks are for telemetry: an exception thrown inside one is caught and
 * logged, so it can never change the outcome of the operation that failed.
 *
 * @param label - Log prefix naming the builder, e.g. `Navios-API`
 * @internal
 */
export function callErrorHook<Args extends unknown[]>(
  hook: ((...args: Args) => void) | undefined,
  label: string,
  ...args: Args
): void {
  if (!hook) return
  try {
    hook(...args)
  } catch (hookError) {
    console.error(`[${label}]: onError hook threw`, hookError)
  }
}
