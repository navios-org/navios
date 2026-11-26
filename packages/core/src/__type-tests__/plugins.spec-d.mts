import { describe, expectTypeOf, it } from 'vitest'

import {
  createApplication,
  createContextKey,
  definePlugin,
  LoggerOutput,
  Module,
  UseGuards,
  UseInterceptors,
} from '../index.mjs'
import { defineTransport } from '../transport.mjs'

import type {
  Application,
  ExecutionContext,
  Guard,
  GuardClass,
  Interceptor,
  InterceptorClass,
  LoggerService,
  PluginApi,
  PluginInstance,
  TransportInstance,
} from '../index.mjs'

class Neither {}
class AnyGuard implements Guard {
  canActivate() {
    return true
  }
}
class AnyInterceptor implements Interceptor {
  intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
    return next()
  }
}

describe('guards and interceptors', () => {
  it('are classes that can do it, wherever they are listed', () => {
    Module({ guards: [AnyGuard], interceptors: [AnyInterceptor] })
    // @ts-expect-error not a guard
    Module({ guards: [Neither] })
    // @ts-expect-error not an interceptor
    Module({ interceptors: [Neither] })
    // @ts-expect-error not a guard
    UseGuards(Neither)
    // @ts-expect-error not an interceptor
    UseInterceptors(Neither)

    expectTypeOf<typeof AnyGuard>().toExtend<GuardClass>()
    expectTypeOf<typeof AnyInterceptor>().toExtend<InterceptorClass>()
    expectTypeOf<Application['intercept']>().parameter(0).toEqualTypeOf<InterceptorClass>()
    expectTypeOf<PluginApi['intercept']>().parameter(0).toEqualTypeOf<InterceptorClass>()
  })
})

describe('definePlugin', () => {
  it('asks for options that are required', () => {
    const plugin = definePlugin({ name: 'p', setup(_api, _options: { url: string }) {} })

    expectTypeOf(plugin).parameters.toEqualTypeOf<[options: { url: string }]>()
    expectTypeOf(plugin).returns.toEqualTypeOf<PluginInstance>()
  })

  it('does not ask for options that are optional, or absent', () => {
    const optional = definePlugin({ name: 'p', setup(_api, _options: { url?: string }) {} })
    const none = definePlugin({ name: 'p', setup() {} })

    expectTypeOf(optional).parameters.toEqualTypeOf<[options?: { url?: string }]>()
    expectTypeOf(optional).toBeCallableWith()
    expectTypeOf(none).toBeCallableWith()
    // @ts-expect-error there are no options
    none({ url: 'x' })
  })

  it('types what a plugin provides and decorates', () => {
    definePlugin({
      name: 'p',
      setup(api) {
        api.provide(LoggerOutput, { value: console })
        // @ts-expect-error not a logger
        api.provide(LoggerOutput, { value: 42 })
        // @ts-expect-error not a logger
        api.provide(LoggerOutput, Neither)
        api.decorate(LoggerOutput, (output) => {
          expectTypeOf(output).toEqualTypeOf<LoggerService>()
          return output
        })
      },
    })
  })
})

describe('defineTransport', () => {
  it('asks for options only when one of them is required', () => {
    const transport = () => ({ setup() {}, stop() {} })
    const required = defineTransport({
      name: 't',
      create: (_host, _options: { url: string }) => transport(),
    })
    const optional = defineTransport({
      name: 't',
      create: (_host, _options: { url?: string }) => transport(),
    })
    const none = defineTransport({ name: 't', create: transport })

    expectTypeOf(required).parameters.toEqualTypeOf<
      [options: { url: string }, instanceName?: string]
    >()
    expectTypeOf(optional).parameters.toEqualTypeOf<
      [options?: { url?: string }, instanceName?: string]
    >()
    expectTypeOf(none).toBeCallableWith()
    expectTypeOf(none).returns.toExtend<TransportInstance>()
    createApplication(Neither, { transports: [required({ url: 'x' }, 'name')] })
  })
})

describe('context keys', () => {
  it('hold a promise when they are of one', () => {
    const Later = createContextKey<Promise<number>>('Later')
    const set = (ctx: ExecutionContext) => {
      ctx.set(Later, Promise.resolve(1))
      expectTypeOf(ctx.get(Later)).toEqualTypeOf<Promise<number>>()
      // @ts-expect-error another type
      ctx.set(Later, Promise.resolve('x'))
    }
    void set
  })
})
