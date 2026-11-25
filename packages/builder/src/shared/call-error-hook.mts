/**
 * Calls an `onError` hook with an error.
 *
 * Hooks are for telemetry: an exception thrown inside one is caught and
 * logged, so it can never change the outcome of the operation that failed.
 *
 * @param label - Log prefix naming the builder, e.g. `Navios-API`
 * @internal
 */
export function callErrorHook<TError>(
  hook: ((error: TError) => void) | undefined,
  error: TError,
  label: string,
): void {
  if (!hook) return
  try {
    hook(error)
  } catch (hookError) {
    console.error(`[${label}]: onError hook threw`, hookError)
  }
}
