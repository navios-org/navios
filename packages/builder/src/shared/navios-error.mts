/**
 * Base error class for everything thrown by Navios Builder.
 *
 * Request failures are reported as {@link EndpointError}, which extends this
 * class. A bare `NaviosError` is thrown for mistakes in a declaration (for
 * example a `urlParamsSchema` that does not match the URL).
 */
export class NaviosError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NaviosError'
  }
}
