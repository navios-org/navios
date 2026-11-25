import type { Container, RequestContext, ScopedContainer } from '@navios/core'

import { MissingContextError } from './errors.mjs'

/** Stands in for the request context when there is none. */
export const NO_CONTEXT = new Proxy(Object.freeze({}), {
  get(_target, property) {
    // Promise resolution and inspection probe for these; they are not reads
    // of the context.
    if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
      return undefined
    }
    throw new MissingContextError(property)
  },
}) as RequestContext

export interface RenderEnvironment {
  container: Container | ScopedContainer | undefined
  ctx: RequestContext
}
