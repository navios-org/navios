/**
 * Base exception class for all HTTP exceptions in Navios.
 *
 * All HTTP exception classes extend this base class. When thrown from an endpoint handler,
 * Navios will automatically convert it to an appropriate HTTP response with the specified
 * status code and response body.
 *
 * @example
 * ```typescript
 * @Endpoint(getUserEndpoint)
 * async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *   const user = await this.userService.findById(request.urlParams.userId)
 *   if (!user) {
 *     throw new HttpException(404, 'User not found')
 *   }
 *   return user
 * }
 * ```
 */
export declare class HttpException {
    readonly statusCode: number;
    readonly response: string | object;
    readonly error?: Error | undefined;
    /**
     * Creates a new HttpException instance.
     *
     * @param statusCode - HTTP status code (e.g., 400, 404, 500)
     * @param response - Response body (string or object)
     * @param error - Optional underlying error for logging/debugging
     */
    constructor(statusCode: number, response: string | object, error?: Error | undefined);
}
//# sourceMappingURL=http.exception.d.mts.map