import type { CookieOptions } from '../routing/cookies.mjs'

export interface ReplyControls {
  /** Sets a response header. */
  header(name: string, value: string): void
  /** Adds a `Set-Cookie` to the response. */
  cookie(name: string, value: string, options?: CookieOptions): void
}
