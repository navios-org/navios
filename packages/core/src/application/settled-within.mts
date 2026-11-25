/** The longest delay a timer takes. */
export const MAX_DELAY_MS = 2 ** 31 - 1

/**
 * Whether `work` settles within `ms`. Rejects when it rejects in time; a later
 * rejection is dropped.
 */
export async function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  if (ms > MAX_DELAY_MS) {
    await work
    return true
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(resolve, ms, false)
  })
  try {
    return await Promise.race([work.then(() => true), timeout])
  } finally {
    clearTimeout(timer)
  }
}
