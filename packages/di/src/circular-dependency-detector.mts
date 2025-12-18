import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

/**
 * Detects circular dependencies by analyzing the waitingFor relationships
 * between service holders.
 *
 * The detector uses BFS to traverse the waitingFor graph starting from a target holder
 * and checks if following the chain leads back to the waiter, indicating a circular dependency.
 */
export class CircularDependencyDetector {
  /**
   * Detects if waiting for `targetName` from `waiterName` would create a cycle.
   *
   * This works by checking if `targetName` (or any holder in its waitingFor chain)
   * is currently waiting for `waiterName`. If so, waiting would create a deadlock.
   *
   * @param waiterName The name of the holder that wants to wait
   * @param targetName The name of the holder being waited on
   * @param getHolder Function to retrieve a holder by name
   * @returns The cycle path if a cycle is detected, null otherwise
   */
  static detectCycle(
    waiterName: string,
    targetName: string,
    getHolder: (name: string) => ServiceLocatorInstanceHolder | undefined,
  ): string[] | null {
    // Use BFS to find if there's a path from targetName back to waiterName
    const visited = new Set<string>()
    const queue: Array<{ name: string; path: string[] }> = [
      { name: targetName, path: [waiterName, targetName] },
    ]

    while (queue.length > 0) {
      const { name: currentName, path } = queue.shift()!

      // If we've reached back to the waiter, we have a cycle
      if (currentName === waiterName) {
        return path
      }

      // Skip if already visited
      if (visited.has(currentName)) {
        continue
      }
      visited.add(currentName)

      // Get the holder and check what it's waiting for
      const holder = getHolder(currentName)
      if (!holder) {
        continue
      }

      // Add all services this holder is waiting for to the queue
      for (const waitingForName of holder.waitingFor) {
        if (!visited.has(waitingForName)) {
          queue.push({
            name: waitingForName,
            path: [...path, waitingForName],
          })
        }
      }
    }

    // No path found from target back to waiter, no cycle
    return null
  }

  /**
   * Formats a cycle path into a human-readable string.
   *
   * @param cycle The cycle path (array of service names)
   * @returns Formatted string like "ServiceA -> ServiceB -> ServiceA"
   */
  static formatCycle(cycle: string[]): string {
    return cycle.join(' -> ')
  }
}
