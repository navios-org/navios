/**
 * Custom error class for Navios Builder errors.
 *
 * This error is thrown when:
 * - No HTTP client has been provided via `provideClient`
 * - Other builder-specific errors occur
 *
 * @example
 * ```ts
 * try {
 *   API.getClient()
 * } catch (error) {
 *   if (error instanceof NaviosError) {
 *     console.error('Navios error:', error.message)
 *   }
 * }
 * ```
 */
export class NaviosError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NaviosError'
  }
}

/**
 * @deprecated Use NaviosError instead. Will be removed in next major version.
 */
export const NaviosException = NaviosError
