/**
 * Waits for promises to settle, but not for ever: a regression in the
 * lifecycle must fail a test, not hang the run.
 */
export async function settleWithin(promises: Promise<unknown>[], ms = 1000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled(promises),
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms)
    }),
  ])
  clearTimeout(timer)
}
