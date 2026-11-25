export interface RequestHeaders {
  get(name: string): string | undefined
  /** All request headers as a web `Headers` object. Built on first call. */
  toWebHeaders(): Headers
}

/** The parsed query string: a repeated parameter is an array. */
export type RequestQuery = Readonly<Record<string, string | string[] | undefined>>

export interface RequestCookies {
  get(name: string): string | undefined
  all(): Readonly<Record<string, string>>
}
