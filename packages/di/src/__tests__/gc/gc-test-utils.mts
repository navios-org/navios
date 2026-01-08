/**
 * Shared utilities for garbage collection tests
 *
 * These tests require Node.js to be started with --expose-gc flag
 * to enable manual garbage collection triggering via global.gc()
 */

/**
 * Check if garbage collection is available
 */
export const isGCAvailable = typeof global.gc === 'function'

/**
 * Force garbage collection if available
 * Should be called after removing references to test objects
 */
export function forceGC(): void {
  if (isGCAvailable) {
    global.gc!()
  }
}

/**
 * Get current heap memory usage in bytes
 */
export function getHeapUsed(): number {
  return process.memoryUsage().heapUsed
}

/**
 * Get current heap memory usage in MB
 */
export function getHeapUsedMB(): number {
  return getHeapUsed() / 1024 / 1024
}

/**
 * Measure memory delta during a callback execution
 * Forces GC before and after to get accurate measurements
 */
export async function measureMemoryDelta(
  callback: () => Promise<void>
): Promise<{ before: number; after: number; delta: number }> {
  forceGC()
  const before = getHeapUsed()

  await callback()

  forceGC()
  const after = getHeapUsed()

  return {
    before,
    after,
    delta: after - before,
  }
}

/**
 * Create a WeakRef tracker for an object
 * Returns a function that checks if the object has been collected
 */
export function createGCTracker<T extends object>(
  obj: T
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
  intervalMs: number = 10
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

/**
 * Create a large object to simulate memory pressure
 * Size is in bytes (approximately)
 */
export function createLargeObject(sizeBytes: number): { data: Uint8Array } {
  return {
    data: new Uint8Array(sizeBytes),
  }
}

/**
 * Create multiple large objects to simulate batch allocations
 */
export function createLargeObjects(
  count: number,
  sizePerObject: number
): Array<{ data: Uint8Array }> {
  return Array.from({ length: count }, () => createLargeObject(sizePerObject))
}

/**
 * Memory threshold check - verifies memory is within expected bounds
 * Useful for detecting memory leaks
 */
export function assertMemoryWithinBounds(
  actualBytes: number,
  expectedBytes: number,
  tolerancePercent: number = 20
): void {
  const tolerance = expectedBytes * (tolerancePercent / 100)
  const lowerBound = expectedBytes - tolerance
  const upperBound = expectedBytes + tolerance

  if (actualBytes < lowerBound || actualBytes > upperBound) {
    throw new Error(
      `Memory usage ${actualBytes} bytes is outside expected bounds ` +
        `[${lowerBound}, ${upperBound}] (expected: ${expectedBytes} ±${tolerancePercent}%)`
    )
  }
}
