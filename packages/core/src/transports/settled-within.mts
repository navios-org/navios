/** The longest delay a timer takes; a longer one fires at once. */
export const MAX_DELAY_MS = 2 ** 31 - 1

/**
 * Whether `work` settles within `ms`, or within `MAX_DELAY_MS` when `ms` is
 * longer. Rejects when it rejects in time; a later rejection is dropped.
 */
export async function settledWithin(work: PromiseLike<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(resolve, Math.min(ms, MAX_DELAY_MS), false)
  })
  try {
    return await Promise.race([Promise.resolve(work).then(() => true), timeout])
  } finally {
    clearTimeout(timer)
  }
}
