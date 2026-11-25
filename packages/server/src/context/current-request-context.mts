import { currentContext as currentExecutionContext } from '@navios/core'

import { RequestContext } from './request-context.mjs'

/**
 * The context of the request being handled, for code that cannot receive it
 * as an argument. Returns `undefined` outside a request, and always when the
 * application was not created with `asyncContext: true`.
 */
export function currentContext(): RequestContext | undefined {
  const context = currentExecutionContext()
  return context instanceof RequestContext ? context : undefined
}
