import { createContextKey } from '@navios/core'

import type { Span } from '@opentelemetry/api'

/**
 * The server span of the current request, stored on the request context by
 * the plugin's interceptor.
 *
 * ```ts
 * getUser = handler(getUser, ({ urlParams }, ctx) => {
 *   ctx.find(RequestSpan)?.setAttribute('user.id', urlParams.id)
 * })
 * ```
 *
 * Read it with `ctx.find()`: the key is not set for ignored routes or when
 * HTTP tracing is turned off.
 */
export const RequestSpan = createContextKey<Span>('OtelRequestSpan')
