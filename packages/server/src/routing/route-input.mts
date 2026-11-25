/**
 * What an adapter hands to a route executor for one request. Everything that
 * may cost something is a function, so a route that does not need it never
 * pays for it.
 */
export interface RouteInput {
  readonly method: string
  /** Request path without the query string. */
  readonly path: string
  /** Adapter-provided request id, if it has one. */
  readonly id?: string
  header(name: string): string | undefined
  /** Every request header, for code that needs a web `Headers` object. */
  headers(): Headers
  /**
   * Every request header as a record of the caller's own, with lower-case
   * names and a repeated header joined with `, `. Optional: for an adapter
   * that has no cheaper source, the record is built from `headers()`.
   */
  headerRecord?(): Record<string, string | undefined>
  /** Decoded URL params of the whole path, prefixes included. */
  readonly urlParams: Record<string, string>
  /** Parsed query string. Called at most once per request. */
  query(): unknown
  /** Parsed request body. Not called before guards have passed. */
  body(): unknown | Promise<unknown>
  /** Aborts when the client disconnects. */
  signal(): AbortSignal
  /** The adapter's native objects, exposed as `ctx.raw`. */
  readonly raw: unknown
  /**
   * Whether the response was already written through the native objects
   * (`ctx.raw`). The pipeline then skips response validation and the adapter
   * writes nothing. Optional: adapters without a native reply omit it.
   */
  responded?(): boolean
}
