import type { PlainContextKey } from '@navios/core'

import type { RequestValueClass } from './request-value.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A slot of the request context: a plain key (`createContextKey`) or a
 * request value (`@RequestValue`).
 */
export type ContextKey<T = any> = PlainContextKey<T> | RequestValueClass<T>
