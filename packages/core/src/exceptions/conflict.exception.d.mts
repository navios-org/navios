import { HttpException } from './http.exception.mjs';
/**
 * Exception that represents a 409 Conflict HTTP error.
 *
 * Use this exception when the request conflicts with the current state of the resource
 * (e.g., trying to create a resource that already exists).
 *
 * @example
 * ```typescript
 * @Endpoint(createUserEndpoint)
 * async createUser(request: EndpointParams<typeof createUserEndpoint>) {
 *   const existing = await this.userService.findByEmail(request.data.email)
 *   if (existing) {
 *     throw new ConflictException('User with this email already exists')
 *   }
 *   // ...
 * }
 * ```
 */
export declare class ConflictException extends HttpException {
    /**
     * Creates a new ConflictException.
     *
     * @param message - Error message or response object
     * @param error - Optional underlying error for logging
     */
    constructor(message: string | object, error?: Error);
}
//# sourceMappingURL=conflict.exception.d.mts.map