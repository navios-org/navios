/**
 * The error thrown when `@HttpCode` meets an endpoint declared with a
 * per-status `responses` map, whichever of the two decorators runs last.
 */
export function httpCodeOnResponsesEndpoint(config: { method: string; url: string }): Error {
  return new Error(
    `[Navios] @HttpCode cannot be used on ${config.method} ${config.url}: the endpoint is declared with a per-status responses map, so its method picks the status with reply(status, body). Remove @HttpCode.`,
  )
}
