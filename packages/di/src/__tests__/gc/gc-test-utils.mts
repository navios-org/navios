/**
 * Shared utilities for garbage collection tests.
 *
 * They need `--expose-gc`, which the vitest config of the package passes to
 * its workers.
 */

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

export function forceGC(): void {
  if (typeof global.gc !== 'function') {
    throw new Error('Garbage collection is not exposed; run the tests with --expose-gc')
  }
  global.gc()
}

/**
 * The memory in use, in bytes, after everything collectable is collected.
 * Counts the contents of typed arrays, which are not on the JavaScript heap.
 */
export async function memoryInUse(): Promise<number> {
  // Settled promise chains become collectable when the microtask queue has
  // drained, and the contents of array buffers are freed a little later.
  for (let i = 0; i < 4; i++) {
    await tick()
    forceGC()
  }
  const { heapUsed, arrayBuffers } = process.memoryUsage()
  return heapUsed + arrayBuffers
}

/**
 * Create a WeakRef tracker for an object
 * Returns a function that checks if the object has been collected
 */
export function createGCTracker<T extends object>(
  obj: T,
): () => { collected: boolean; ref: WeakRef<T> } {
  const ref = new WeakRef(obj)
  return () => ({
    collected: ref.deref() === undefined,
    ref,
  })
}

/**
 * Wait for an object to be garbage collected
 * Returns true if collected within timeout, false otherwise
 */
export async function waitForGC<T extends object>(
  ref: WeakRef<T>,
  timeoutMs: number = 1000,
  intervalMs: number = 10,
): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    forceGC()

    if (ref.deref() === undefined) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return false
}

/** How many of the objects are still alive after a collection. */
export async function countAlive(refs: WeakRef<object>[]): Promise<number> {
  await memoryInUse()
  return refs.filter((ref) => ref.deref() !== undefined).length
}
