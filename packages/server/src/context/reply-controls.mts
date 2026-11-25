import type { HeaderValue } from '../responses/response-headers.mjs'
import type { CookieOptions } from '../routing/cookies.mjs'

/**
 * Response headers and cookies. Names and values are checked when they are
 * set, so one that cannot be sent fails where it comes from.
 */
export interface ReplyControls {
  /**
   * Sets a response header, in place of what was set under that name. A list
   * is sent as one header line per value.
   */
  header(name: string, value: HeaderValue): void
  /** Adds a value to a response header, next to what was set under that name. */
  append(name: string, value: HeaderValue): void
  /**
   * Adds a `Set-Cookie` to the response, in place of an earlier one with the
   * same name, domain and path.
   */
  cookie(name: string, value: string, options?: CookieOptions): void
  /**
   * Makes the browser delete a cookie. Pass the domain and the path it was
   * set with.
   */
  deleteCookie(name: string, options?: Omit<CookieOptions, 'expires' | 'maxAge'>): void
}
