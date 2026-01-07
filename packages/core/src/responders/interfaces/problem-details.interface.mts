/**
 * RFC 7807 Problem Details for HTTP APIs
 * @see https://tools.ietf.org/html/rfc7807
 */
export interface ProblemDetails {
  /**
   * A URI reference that identifies the problem type.
   * When dereferenced, it should provide human-readable documentation.
   * @default 'about:blank'
   */
  type?: string

  /**
   * A short, human-readable summary of the problem type.
   * It should not change from occurrence to occurrence.
   */
  title: string

  /**
   * The HTTP status code for this occurrence of the problem.
   */
  status: number

  /**
   * A human-readable explanation specific to this occurrence of the problem.
   */
  detail?: string

  /**
   * Additional extension members.
   * Custom properties can be added to provide more context.
   */
  [key: string]: unknown
}
