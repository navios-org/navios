import type { ManagedBody } from '../responses/managed-body.mjs'

/**
 * - `string` and `Uint8Array`: in memory.
 * - `Blob`: in memory or, for the files of a runtime, on disk.
 * - `ManagedBody`: produced while it is being sent.
 * - `null`: no body.
 */
export type RouteBody = string | Uint8Array | Blob | ManagedBody | null

/**
 * What a route executor returns: a response an adapter writes as it is.
 * Everything that could make it unwritable has been dealt with.
 */
export interface RouteResponse {
  /** 200 to 599. */
  readonly status: number
  /**
   * Content type and cookies included, names in lower case, names and values
   * checked. A list is one header line per value. Shared between responses,
   * so never changed.
   */
  readonly headers: Readonly<Record<string, string | readonly string[]>>
  readonly body: RouteBody
  /**
   * Present when the request holds something: a DI scope, request values with
   * a `dispose` hook, `onFinish` callbacks, a body that is produced while it
   * is sent. The adapter calls it once: when the response has been sent, the
   * connection is gone, the body will not be sent (`HEAD`) or writing failed.
   *
   * It closes the body, runs the `onFinish` callbacks, disposes request
   * values and then the scope. It never rejects, and calls no user code
   * before it returns.
   */
  readonly release: (() => Promise<void>) | undefined
  /**
   * Whether the handler writes the response itself, and the adapter nothing.
   * It may not have written anything yet. Only where `RouteInput` has
   * `responded()`.
   */
  readonly takenOver?: boolean
}
