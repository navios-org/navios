/**
 * Calls the listeners registered when the call starts. One that is added
 * meanwhile waits for the next dispatch (a listener that registers itself again
 * would otherwise be called forever), and one that is removed is not called.
 *
 * @param listeners - The current listeners, read again before each call
 * @param call - Calls one listener. Must not throw
 */
export function dispatch<Listener>(
  listeners: () => ReadonlySet<Listener> | undefined,
  call: (listener: Listener) => void,
): void {
  const atStart = Array.from(listeners() ?? [])
  for (const listener of atStart) {
    if (listeners()?.has(listener)) call(listener)
  }
}
