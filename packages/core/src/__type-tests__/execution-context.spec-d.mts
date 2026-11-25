import { describe, expectTypeOf, it } from 'vitest'

import { RequestValue } from '../index.mjs'

import type {
  ContextKey as KernelContextKey,
  ContextValue as KernelContextValue,
  PlainContextKey,
} from '../execution/context-key.mjs'
import type { ExecutionContext, HandlerInfo } from '../execution/execution-context.mjs'
import type { ContextKey, RequestContext, RouteInfo } from '../index.mjs'

describe('execution context contracts', () => {
  it('is implemented by the request context', () => {
    expectTypeOf<RequestContext>().toExtend<ExecutionContext>()
    expectTypeOf<RouteInfo>().toExtend<HandlerInfo>()
  })

  it('types a plain key value', () => {
    expectTypeOf<KernelContextValue<PlainContextKey<number>>>().toEqualTypeOf<number>()
  })

  it('keeps request values out of the kernel key type', () => {
    @RequestValue()
    class SessionValue {
      resolve() {
        return 'session'
      }
    }
    const http: ContextKey = SessionValue
    // @ts-expect-error a request value is not a kernel context key
    const kernel: KernelContextKey = SessionValue
    void http
    void kernel
  })
})
