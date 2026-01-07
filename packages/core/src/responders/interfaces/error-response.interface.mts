import type { ProblemDetails } from './problem-details.interface.mjs'

/**
 * Represents a complete error response that can be sent to the client.
 * Includes the status code, payload (RFC 7807 Problem Details), and headers.
 */
export interface ErrorResponse {
  /**
   * HTTP status code for the response.
   */
  statusCode: number

  /**
   * RFC 7807 Problem Details payload.
   */
  payload: ProblemDetails

  /**
   * HTTP headers to include in the response.
   */
  headers: Record<string, string>
}
