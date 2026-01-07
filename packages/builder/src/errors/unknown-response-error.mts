import type { AbstractResponse } from '../types/index.mjs'

/**
 * Error thrown when an error response's status code does not match
 * any schema in the endpoint's errorSchema record.
 *
 * This only occurs when:
 * - `useDiscriminatorResponse` is `true`
 * - `errorSchema` is defined for the endpoint
 * - The response status code is NOT found in the errorSchema keys
 *
 * @example
 * ```ts
 * try {
 *   await api.getUser({ urlParams: { id: '123' } })
 * } catch (error) {
 *   if (error instanceof UnknownResponseError) {
 *     console.log('Unhandled status:', error.statusCode)
 *     console.log('Response data:', error.response.data)
 *   }
 * }
 * ```
 */
export class UnknownResponseError extends Error {
  constructor(
    public readonly response: AbstractResponse<unknown>,
    public readonly statusCode: number,
  ) {
    super(
      `[Navios-API]: Unknown error response (status ${statusCode}). ` +
        `No matching schema in errorSchema.`,
    )
    this.name = 'UnknownResponseError'
  }
}
