import type { Client } from './client.mjs'
import type {
  EndpointHandler,
  NoUnknownOptions,
  RequireResponseSchema,
  WithBuilderErrors,
} from './endpoint-handler.mjs'
import type { BaseEndpointOptions } from './endpoint-options.mjs'
import type { ErrorSchemaRecord } from './error-schema.mjs'

/**
 * A builder, from `builder(config)`.
 *
 * @template Errors - The shared error schemas of `builder({ errorSchema })`;
 *   `{}` when there are none
 */
export interface BuilderInstance<Errors extends ErrorSchemaRecord = {}> {
  /**
   * The error schemas every endpoint of this builder shares, as given to
   * `builder({ errorSchema })`; `{}` when there are none.
   */
  readonly errorSchema: Errors

  /**
   * Sets or replaces the HTTP client used by every endpoint declared on this
   * builder. Meant for application start-up; prefer `builder({ client })`.
   * For a per-request client, pass `{ client }` as the second call argument.
   */
  provideClient(client: Client): void

  /**
   * Returns the currently configured HTTP client.
   * Throws NaviosError if no client has been provided.
   */
  getClient(): Client

  /**
   * Returns a new builder with the same configuration and a different
   * client. Endpoints declared on the returned builder use that client;
   * endpoints already declared on this builder are not affected.
   */
  withClient(client: Client): BuilderInstance<Errors>

  /**
   * Declares a type-safe API endpoint.
   *
   * Uses `const` type parameter inference to derive every type from the
   * options object.
   *
   * @example
   * ```ts
   * // JSON endpoint
   * const getUser = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   *   errorSchema: { 404: z.object({ message: z.string() }) },
   * })
   *
   * // File upload
   * const upload = api.declareEndpoint({
   *   method: 'POST',
   *   url: '/files',
   *   body: 'multipart',
   *   requestSchema: z.object({ file: z.instanceof(File) }),
   *   responseSchema: z.object({ id: z.string() }),
   * })
   *
   * // File download
   * const download = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/files/$fileId',
   *   response: 'blob',
   * })
   *
   * // No response body (204)
   * const remove = api.declareEndpoint({
   *   method: 'DELETE',
   *   url: '/files/$fileId',
   *   response: 'void',
   * })
   * ```
   */
  declareEndpoint<const Options extends BaseEndpointOptions>(
    options: Options & RequireResponseSchema<Options> & NoUnknownOptions<Options>,
  ): EndpointHandler<WithBuilderErrors<Options, Errors>>
}
