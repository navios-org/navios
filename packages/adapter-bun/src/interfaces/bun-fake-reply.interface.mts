/**
 * A fake reply object for the Bun adapter that collects response information.
 *
 * Since Bun uses the standard Web API Response object instead of a mutable reply,
 * this class provides a way to capture status and body information from guards
 * and other middleware that expect a reply object with `.status().send()` interface.
 *
 * After guards run, the collected information can be used to construct a Response object.
 *
 * @example
 * ```ts
 * const fakeReply = new BunFakeReply()
 * const context = new BunExecutionContext(module, controller, handler, request, fakeReply)
 *
 * await guardRunner.runGuards(guards, context, container)
 *
 * if (fakeReply.hasResponse()) {
 *   return fakeReply.toResponse()
 * }
 * // Continue with normal request handling...
 * ```
 */
export class BunFakeReply {
  private _statusCode: number = 200
  private _body: unknown = null
  private _sent: boolean = false
  private _headers: Record<string, string> = {}

  /**
   * Sets the HTTP status code for the response.
   * Returns `this` for chaining.
   *
   * @param code - The HTTP status code.
   * @returns This instance for method chaining.
   */
  status(code: number): this {
    this._statusCode = code
    return this
  }

  /**
   * Sets the response body and marks the response as sent.
   *
   * @param body - The response body (will be JSON stringified if not a string).
   */
  send(body: unknown): void {
    this._body = body
    this._sent = true
  }

  /**
   * Sets a response header.
   * Returns `this` for chaining.
   *
   * @param name - The header name.
   * @param value - The header value.
   * @returns This instance for method chaining.
   */
  header(name: string, value: string): this {
    this._headers[name] = value
    return this
  }

  /**
   * Checks if a response has been sent via this fake reply.
   *
   * @returns `true` if `send()` was called, `false` otherwise.
   */
  hasResponse(): boolean {
    return this._sent
  }

  /**
   * Gets the collected status code.
   */
  getStatusCode(): number {
    return this._statusCode
  }

  /**
   * Gets the collected body.
   */
  getBody(): unknown {
    return this._body
  }

  /**
   * Converts the collected information into a Web API Response object.
   *
   * @returns A Response object with the collected status, body, and headers.
   */
  toResponse(): Response {
    const headers: Record<string, string> = { ...this._headers }

    // Set Content-Type if not already set and body is an object
    if (!headers['Content-Type'] && typeof this._body === 'object') {
      headers['Content-Type'] = 'application/json'
    }

    const body =
      typeof this._body === 'string' ? this._body : JSON.stringify(this._body)

    return new Response(body, {
      status: this._statusCode,
      headers,
    })
  }

  /**
   * Resets the fake reply to its initial state.
   * Useful for reusing the same instance.
   */
  reset(): void {
    this._statusCode = 200
    this._body = null
    this._sent = false
    this._headers = {}
  }
}
