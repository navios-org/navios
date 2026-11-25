import { isInstance } from './is-instance.mjs'

import type { PreparedRequestConfig } from './request-config.mjs'

export interface Deadline {
  /** The signal the request runs with. */
  signal: AbortSignal | null | undefined
  /** Whether `timeout` has elapsed. */
  expired: () => boolean
  /**
   * Keeps a body that is still to be read abortable by the caller's signal,
   * until it ends or is cancelled.
   */
  followBody: (body: unknown) => unknown
  /** Releases the timer, and the listener on the caller's signal unless a body follows it. */
  release: () => void
}

/** What a timer can wait for. It fires at once for anything longer. */
const MAX_TIMEOUT = 2 ** 31 - 1

function timeoutError(timeout: number): Error {
  const message = `The request timed out after ${timeout} ms`
  return typeof DOMException === 'function'
    ? new DOMException(message, 'TimeoutError')
    : Object.assign(new Error(message), { name: 'TimeoutError' })
}

/** Removes the listener of a body that was neither read to its end nor cancelled. */
const dropped =
  typeof FinalizationRegistry === 'function'
    ? /* @__PURE__ */ new FinalizationRegistry<() => void>((release) => release())
    : undefined

/** Passes a stream on, and calls `release` once nothing more can come from it. */
function releaseAtEnd(body: ReadableStream, release: () => void): ReadableStream {
  const reader = body.getReader()
  const stream = new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (!done) return controller.enqueue(value)
          controller.close()
        } catch (error) {
          controller.error(error)
        }
        release()
      },
      cancel(reason) {
        release()
        return reader.cancel(reason)
      },
    },
    // Reads only what it is asked for
    { highWaterMark: 0 },
  )
  dropped?.register(stream, release)
  return stream
}

/**
 * Turns `timeout` into a signal, combined with the one the caller gave.
 * `AbortSignal.timeout` and `AbortSignal.any` would do, but are missing in
 * React Native and older browsers.
 */
export function startDeadline(config: PreparedRequestConfig): Deadline {
  const { timeout, signal } = config
  if (typeof timeout !== 'number' || !(timeout > 0 && timeout <= MAX_TIMEOUT)) {
    return { signal, expired: () => false, followBody: (body) => body, release: () => {} }
  }

  const controller = new AbortController()
  let expired = false
  let followed = false
  const timer = setTimeout(() => {
    expired = true
    controller.abort(timeoutError(timeout))
  }, timeout)
  const abort = () => controller.abort(signal?.reason)
  const unfollow = () => signal?.removeEventListener('abort', abort)
  if (signal?.aborted) {
    abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }

  return {
    signal: controller.signal,
    expired: () => expired,
    followBody(body) {
      if (!signal || typeof ReadableStream !== 'function') return body
      if (!isInstance(body, 'ReadableStream')) return body
      followed = true
      return releaseAtEnd(body as ReadableStream, unfollow)
    },
    release() {
      clearTimeout(timer)
      if (!followed) unfollow()
    },
  }
}
