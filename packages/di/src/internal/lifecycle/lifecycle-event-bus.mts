/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */

type ListenersMap = Map<string, Map<string, Set<Function>>>

/**
 * Event bus for service lifecycle events (create, destroy, etc.).
 *
 * Enables loose coupling between services by allowing them to subscribe
 * to lifecycle events of their dependencies without direct references.
 * Used primarily for invalidation cascading.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
export class LifecycleEventBus {
  private listeners: ListenersMap = new Map()
  constructor(private readonly logger: Console | null = null) {}

  on<Event extends string | `pre:${string}` | `post:${string}`>(
    ns: string,
    event: Event,
    listener: (event: Event) => void,
  ) {
    this.logger?.debug(`[LifecycleEventBus]#on(): ns:${ns} event:${event}`)
    if (!this.listeners.has(ns)) {
      this.listeners.set(ns, new Map())
    }

    const nsEvents = this.listeners.get(ns)!
    if (!nsEvents.has(event)) {
      nsEvents.set(event, new Set())
    }

    nsEvents.get(event)!.add(listener)

    return () => {
      nsEvents.get(event)?.delete(listener)
      if (nsEvents.get(event)?.size === 0) {
        nsEvents.delete(event)
      }
      if (nsEvents.size === 0) {
        this.listeners.delete(ns)
      }
    }
  }

  async emit(key: string, event: string) {
    if (!this.listeners.has(key)) {
      return
    }

    const events = this.listeners.get(key)!

    this.logger?.debug(`[LifecycleEventBus]#emit(): ${key}:${event}`)

    const res = await Promise.allSettled(
      [...(events.get(event) ?? [])!].map((listener) => listener(event)),
    ).then((results) => {
      const res = results
        .filter((result) => result.status === 'rejected')
        .map((result: PromiseRejectedResult) => {
          this.logger?.warn(
            `[LifecycleEventBus]#emit(): ${key}:${event} rejected with`,
            result.reason,
          )
          return result
        })

      if (res.length > 0) {
        return Promise.reject(res)
      }
      return results
    })
    return res
  }
}

