export interface CookieOptions {
  domain?: string
  /** @default '/' */
  path?: string
  expires?: Date
  /** In seconds. */
  maxAge?: number
  httpOnly?: boolean
  secure?: boolean
  /** `none` needs `secure`: without it browsers drop the cookie. */
  sameSite?: 'strict' | 'lax' | 'none'
  /** A separate cookie per top-level site (CHIPS). Needs `secure`. */
  partitioned?: boolean
}

export interface SetCookie {
  name: string
  value: string
  options?: CookieOptions
}
