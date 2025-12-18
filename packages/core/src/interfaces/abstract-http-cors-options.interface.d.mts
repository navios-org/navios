import type { LogLevel } from '../logger/index.mjs';
interface ArrayOfValueOrArray<T> extends Array<ValueOrArray<T>> {
}
type OriginType = string | boolean | RegExp;
type ValueOrArray<T> = T | ArrayOfValueOrArray<T>;
export interface AbstractHttpCorsOptions {
    /**
     * Configures the Access-Control-Allow-Origin CORS header.
     */
    origin?: ValueOrArray<OriginType>;
    /**
     * Configures the Access-Control-Allow-Credentials CORS header.
     * Set to true to pass the header, otherwise it is omitted.
     */
    credentials?: boolean;
    /**
     * Configures the Access-Control-Expose-Headers CORS header.
     * Expects a comma-delimited string (ex: 'Content-Range,X-Content-Range')
     * or an array (ex: ['Content-Range', 'X-Content-Range']).
     * If not specified, no custom headers are exposed.
     */
    exposedHeaders?: string | string[];
    /**
     * Configures the Access-Control-Allow-Headers CORS header.
     * Expects a comma-delimited string (ex: 'Content-Type,Authorization')
     * or an array (ex: ['Content-Type', 'Authorization']). If not
     * specified, defaults to reflecting the headers specified in the
     * request's Access-Control-Request-Headers header.
     */
    allowedHeaders?: string | string[];
    /**
     * Configures the Access-Control-Allow-Methods CORS header.
     * Expects a comma-delimited string (ex: 'GET,PUT,POST') or an array (ex: ['GET', 'PUT', 'POST']).
     */
    methods?: string | string[];
    /**
     * Configures the Access-Control-Max-Age CORS header.
     * Set to an integer to pass the header, otherwise it is omitted.
     */
    maxAge?: number;
    /**
     * Configures the Cache-Control header for CORS preflight responses.
     * Set to an integer to pass the header as `Cache-Control: max-age=${cacheControl}`,
     * or set to a string to pass the header as `Cache-Control: ${cacheControl}` (fully define
     * the header value), otherwise the header is omitted.
     */
    cacheControl?: number | string;
    /**
     * Sets the Fastify log level specifically for the internal OPTIONS route
     * used to handle CORS preflight requests. For example, setting this to `'silent'`
     * will prevent these requests from being logged.
     * Useful for reducing noise in application logs.
     * Default: inherits Fastify's global log level.
     */
    logLevel?: LogLevel;
}

//# sourceMappingURL=abstract-http-cors-options.interface.d.mts.map