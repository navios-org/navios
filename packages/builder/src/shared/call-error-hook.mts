/**
 * Calls an `onError` hook with an error and, for hooks that take one, a
 * context object.
 *
 * Hooks are for telemetry: an exception thrown inside one is caught and
 * logged, so it can never change the outcome of the operation that failed.
 *
 * @param label - Log prefix naming the builder, e.g. `Navios-API`
 * @internal
 */
export function callErrorHook<TError, TContext = undefined>(
  hook: ((error: TError, context: TContext) => void) | undefined,
  error: TError,
  label: string,
  context?: TContext,
): void {
  if (!hook) return
  try {
    // A hook without a context is called with the error alone, as it always was.
    if (context === undefined) (hook as (error: TError) => void)(error)
    else hook(error, context)
  } catch (hookError) {
    console.error(`[${label}]: onError hook threw`, hookError)
  }
}
