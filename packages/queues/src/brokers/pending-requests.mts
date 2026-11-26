/** How long `request()` waits for its reply. */
export const REQUEST_TIMEOUT_MS = 30_000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

/** The requests of a broker client that wait for their reply, by correlation id. */
export class PendingRequests {
  private readonly pending = new Map<string, PendingRequest>()

  /** Waits for the reply to `id`. Rejects with `Request timeout for <label>` after `ms`. */
  create(id: string, label: string, ms = REQUEST_TIMEOUT_MS): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timeout for ${label}`))
      }, ms)
      this.pending.set(id, { resolve, reject, timeout })
    })
  }

  /**
   * Resolves request `id` with the JSON in `raw`, or rejects it when `raw` is
   * not JSON. Returns false when no request waits for `id`.
   */
  settle(id: string, raw: string): boolean {
    const request = this.take(id)
    if (!request) return false
    try {
      request.resolve(JSON.parse(raw))
    } catch (error) {
      request.reject(error)
    }
    return true
  }

  /** Rejects request `id`, for example when sending it failed. */
  fail(id: string, reason: unknown): void {
    this.take(id)?.reject(reason)
  }

  /** Rejects every waiting request with `Connection closed`. */
  rejectAll(): void {
    // Deleting the entry being visited does not disturb a Map iteration.
    for (const id of this.pending.keys()) {
      this.fail(id, new Error('Connection closed'))
    }
  }

  private take(id: string): PendingRequest | undefined {
    const request = this.pending.get(id)
    if (request) {
      clearTimeout(request.timeout)
      this.pending.delete(id)
    }
    return request
  }
}
