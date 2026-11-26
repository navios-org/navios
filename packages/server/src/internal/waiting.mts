import { ignore } from './promises.mjs'

/** For how many turns of the microtask queue a promise counts as settled already. */
const READY_TURNS = 6

/**
 * Waits for a promise, or for the signal to abort. A rejection that comes
 * after that is handled. The signal is not created for a promise that is as
 * good as settled, such as that of a generator which yields at once.
 * @internal
 */
export async function settledOrAborted(
  pending: Promise<unknown>,
  signal: () => AbortSignal,
): Promise<void> {
  let isSettled = false
  const settle = () => {
    isSettled = true
  }
  pending.then(settle, settle)
  for (let turn = 0; turn < READY_TURNS && !isSettled; turn++) {
    await undefined
  }
  if (isSettled) {
    await pending
    return
  }
  const client = signal()
  if (client.aborted) {
    return
  }
  let onAbort: () => void = ignore
  const aborted = new Promise<void>((resolve) => {
    onAbort = () => resolve()
    client.addEventListener('abort', onAbort, { once: true })
  })
  try {
    await Promise.race([pending, aborted])
  } finally {
    client.removeEventListener('abort', onAbort)
  }
}
