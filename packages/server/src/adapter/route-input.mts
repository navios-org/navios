/** One part of a multipart body: a text field's value, or a file. */
export interface BodyPart {
  readonly name: string
  readonly value: string | File
}

/**
 * The body of a request as an adapter has it. The server decodes it: an
 * adapter knows how to get at the bytes, how many it accepts and how to parse
 * multipart, and nothing else.
 *
 * `bytes()` and `parts()` throw, or reject with, an `HttpException` of status
 * 413 for a body over the adapter's limit, and a `ValidationError` for one
 * that cannot be read. The server calls one of them, once.
 */
export interface BodySource {
  /** The `Content-Type` header as it was sent. */
  readonly contentType: string | undefined
  /** Whether there is no body, or one that is known to have no bytes. */
  readonly isEmpty: boolean
  bytes(): Uint8Array | Promise<Uint8Array>
  /** The parts of a multipart body, in order: one after the other, or all of them. */
  parts(): AsyncIterable<BodyPart> | Promise<Iterable<BodyPart>>
  /**
   * The body, when the application had the native server parse it. Optional:
   * for adapters whose server can be extended with parsers.
   */
  parsed?(): { readonly value: unknown } | undefined
}

/**
 * What an adapter hands to a route executor for one request. Everything that
 * may cost something is a function or a getter, so a route that does not need
 * it never pays for it.
 */
export interface RouteInput {
  /** In upper case. */
  readonly method: string
  /**
   * `canonicalPath()` of the request target. Read for a request that matched
   * no route; the path of one that did comes from the route and `urlParams`.
   */
  readonly path: string
  /** Adapter-provided request id, if it has one. */
  readonly id?: string
  /**
   * The url of the request. Absolute, unless the request names no host, or
   * none that is valid.
   */
  url(): string
  /** The address of the client, if it is known. */
  remoteAddress(): string | undefined
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
  /**
   * Parsed query string, a repeated parameter as a list. Called at most once
   * per request.
   */
  query(): unknown
  /** Read after guards have passed, or when one of them reads the raw body. */
  readonly body: BodySource
  /** Aborts when the client disconnects. */
  signal(): AbortSignal
  /** The adapter's native objects, exposed as `ctx.raw`. */
  readonly raw: unknown
  /**
   * The Web `Request` the server received, for an adapter whose server has
   * one (Bun, srvx), while nobody has read its body. `undefined` otherwise:
   * `ctx.toWebRequest()` then builds one.
   */
  webRequest?(): Request | undefined
  /**
   * Whether the response was already written through the native objects
   * (`ctx.raw`). The pipeline then skips response validation and the adapter
   * writes nothing. Optional: adapters without a native reply omit it.
   */
  responded?(): boolean
  /**
   * The status of a response the handler wrote itself. Read when the
   * response has finished; an adapter that implements `responded()` should
   * implement it too.
   */
  respondedStatus?(): number
}
