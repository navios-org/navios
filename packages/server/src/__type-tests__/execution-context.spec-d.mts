import { describe, expectTypeOf, it } from 'vitest'

import type {
  ContextKey as KernelContextKey,
  ContextValue as KernelContextValue,
  PlainContextKey,
} from '@navios/core'
import type { ExecutionContext, HandlerInfo } from '@navios/core'
import type { ModuleOptions as CoreModuleOptions } from '@navios/core'

import { isHttpContext, Module, RequestValue } from '../index.mjs'

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

  it('adds the HTTP options to @Module of @navios/core', () => {
    class Users {}
    expectTypeOf<CoreModuleOptions>().toHaveProperty('controllers')
    expectTypeOf(Module).toBeCallableWith({ prefix: 'users', controllers: [Users] })
  })

  it('narrows a neutral context to the request context', () => {
    const narrow = (ctx: ExecutionContext) => (isHttpContext(ctx) ? ctx : null)
    expectTypeOf(narrow).returns.toEqualTypeOf<RequestContext | null>()
  })
})
