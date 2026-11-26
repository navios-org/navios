import type { Container } from '@navios/di'

import { BasicExecutionContext } from '../execution/basic-execution-context.mjs'

import type { HandlerInfo } from '../execution/execution-context.mjs'

class Owner {}
class OwnerModule {}

export const fakeHandler: HandlerInfo = {
  module: OwnerModule,
  controller: Owner,
  handlerName: 'run',
  guards: [],
  interceptors: [],
  attributes: { handler: new Map(), controller: new Map(), module: new Map() },
}

export function fakeContext(container: Container): BasicExecutionContext {
  return new BasicExecutionContext({
    kind: 'test',
    id: 'run',
    handler: fakeHandler,
    host: { container, onScopedUse: null },
  })
}
