import { HttpException } from './http.exception.mjs';
/**
 * Exception that represents a 400 Bad Request HTTP error.
 *
 * Use this exception when the client's request is malformed or invalid.
 *
 * @example
 * ```typescript
 * @Endpoint(createUserEndpoint)
 * async createUser(request: EndpointParams<typeof createUserEndpoint>) {
 *   if (!request.data.email) {
 *     throw new BadRequestException('Email is required')
 *   }
 *   // ...
 * }
 * ```
 */
export declare class BadRequestException extends HttpException {
    /**
     * Creates a new BadRequestException.
     *
     * @param message - Error message or response object
     */
    constructor(message: string | object);
}
//# sourceMappingURL=bad-request.exception.d.mts.map