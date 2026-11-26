import type { RequestContext } from './request-context.mjs'

/**
 * What keeps the requests that hold something to release, so that a transport
 * that stops can release them. A `Set` will do.
 */
export interface LiveRequestSet {
  add(ctx: RequestContext): unknown
  delete(ctx: RequestContext): unknown
  readonly size: number
  [Symbol.iterator](): Iterator<RequestContext>
}

/**
 * The requests that hold something to release, linked through the requests
 * themselves. Every request that uses a DI scope is added and removed. A `Set`
 * that lives as long as the server does allocates its new tables in the old
 * generation while it is churned like that, which brings on full garbage
 * collections; this allocates nothing.
 * @internal
 */
export class LiveRequests implements LiveRequestSet {
  private head: RequestContext | null = null
  size = 0

  add(ctx: RequestContext): this {
    if (this.has(ctx)) {
      return this
    }
    const { head } = this
    ctx.nextLive = head
    if (head !== null) {
      head.previousLive = ctx
    }
    this.head = ctx
    this.size++
    return this
  }

  delete(ctx: RequestContext): boolean {
    if (!this.has(ctx)) {
      return false
    }
    const { previousLive, nextLive } = ctx
    if (previousLive === null) {
      this.head = nextLive
    } else {
      previousLive.nextLive = nextLive
    }
    if (nextLive !== null) {
      nextLive.previousLive = previousLive
    }
    ctx.previousLive = null
    ctx.nextLive = null
    this.size--
    return true
  }

  private has(ctx: RequestContext): boolean {
    return ctx.previousLive !== null || this.head === ctx
  }

  /** The requests as they are now: releasing one does not change what is iterated. */
  [Symbol.iterator](): Iterator<RequestContext> {
    const all: RequestContext[] = []
    for (let ctx = this.head; ctx !== null; ctx = ctx.nextLive) {
      all.push(ctx)
    }
    return all[Symbol.iterator]()
  }
}
