/**
 * What adapters share whose server speaks the web platform: it hands them a
 * `Request` and takes a `Response`. For packages that implement an adapter,
 * next to `@navios/server/adapter`.
 */
export { limitBody } from './body-limit.mjs'
export { Cors } from './cors.mjs'
export type { CorsOptions, CorsOrigin, OriginFunction } from './cors.mjs'
export { toWebHeaders } from './headers.mjs'
export { injectRequest } from './inject.mjs'
