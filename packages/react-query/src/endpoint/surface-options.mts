import type { KeyOptions } from './cache-key.mjs'

/**
 * Options shared by every query and mutation surface.
 */
export type SurfaceOptions<WithResponse extends boolean = boolean> = KeyOptions & {
  /**
   * Deliver `{ data, response }` instead of the bare data, where `response`
   * has the status and headers of the HTTP reply. Use it when a header
   * matters to the UI (ETag, pagination totals, rate limits).
   *
   * Entries declared with and without it are stored under different keys.
   *
   * @default false
   */
  withResponse?: WithResponse
}
