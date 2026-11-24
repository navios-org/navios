// Post-build dts shape check: pins public signatures against the BUILT
// declarations (lib/index.d.mts) of five headline packages, so a tsdown / TS
// emit that widens or re-infers types differently fails with TS2344.
// Never executed; type-level only. Run: yarn turbo run check:dts
import { expectTypeOf } from 'vitest'
import { z } from 'zod/v4'

import type * as Fastify from '../adapter-fastify/lib/index.d.mts'
import type * as Builder from '../builder/lib/index.d.mts'
import type * as Core from '../core/lib/index.d.mts'
import type * as Di from '../di/lib/index.d.mts'
import type * as ReactQuery from '../react-query/lib/index.d.mts'

// Values are declared from the type-only imports of the built d.mts files.
declare const inject: typeof Di.inject
declare const asyncInject: typeof Di.asyncInject
declare const optional: typeof Di.optional
declare const InjectionToken: typeof Di.InjectionToken
declare const builder: typeof Builder.builder
declare const NaviosFactory: typeof Core.NaviosFactory
declare const defineFastifyEnvironment: typeof Fastify.defineFastifyEnvironment
declare const declareClient: typeof ReactQuery.declareClient

// ---------------------------------------------------------------- @navios/di
interface FooService {
  makeFoo(): string
}
declare class Foo {
  makeFoo(): string
}

const typedToken = InjectionToken.create<FooService>(Symbol.for('foo'))
expectTypeOf(typedToken).toEqualTypeOf<Di.InjectionToken<FooService, undefined, false>>()
expectTypeOf(inject(typedToken)).toEqualTypeOf<FooService>()
expectTypeOf(inject(Foo)).toEqualTypeOf<Foo>()
expectTypeOf(optional(Foo)).toEqualTypeOf<Foo | null>()
expectTypeOf(asyncInject(Foo)).toEqualTypeOf<Promise<Foo>>()

// ------------------------------------------------------------ @navios/builder
const api = builder()
expectTypeOf(api).toEqualTypeOf<Builder.BuilderInstance>()

const responseSchema = z.object({ id: z.string(), name: z.string() })
const querySchema = z.object({ page: z.number() })
type Response = { id: string; name: string }

const simple = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema })
expectTypeOf<ReturnType<typeof simple>>().toEqualTypeOf<Promise<Response>>()
expectTypeOf<keyof NonNullable<Parameters<typeof simple>[0]>>().toEqualTypeOf<
  'headers' | 'signal' | 'timeout'
>()
expectTypeOf(simple.config.url).toEqualTypeOf<'/users'>()

const withUrl = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema,
  responseSchema,
})
expectTypeOf<ReturnType<typeof withUrl>>().toEqualTypeOf<Promise<Response>>()
expectTypeOf<Parameters<typeof withUrl>[0]['urlParams']>().toEqualTypeOf<{
  userId: string | number
}>()
expectTypeOf<Parameters<typeof withUrl>[0]['params']>().toEqualTypeOf<{ page: number }>()
expectTypeOf(withUrl.config.method).toEqualTypeOf<'GET'>()
expectTypeOf<Builder.UrlHasParams<'/users/$userId'>>().toEqualTypeOf<true>()
expectTypeOf<Builder.UrlHasParams<'/users'>>().toEqualTypeOf<false>()

const download = api.declareEndpoint({ method: 'GET', url: '/files/$fileId', response: 'blob' })
expectTypeOf<ReturnType<typeof download>>().toEqualTypeOf<Promise<Blob>>()
expectTypeOf<Awaited<ReturnType<typeof simple.safe>>['ok']>().toEqualTypeOf<boolean>()

// --------------------------------------------------------------- @navios/core
declare const handler: typeof Core.handler
declare const reply: typeof Core.reply
declare const createContextKey: typeof Core.createContextKey

expectTypeOf<ReturnType<Core.Guard['canActivate']>>().toEqualTypeOf<boolean | Promise<boolean>>()
expectTypeOf<Parameters<Core.Guard['canActivate']>>().toEqualTypeOf<[ctx: Core.RequestContext]>()
expectTypeOf<Parameters<Core.Interceptor['intercept']>>().toEqualTypeOf<
  [ctx: Core.RequestContext, next: () => Promise<Core.RouteResult>]
>()
expectTypeOf<InstanceType<typeof Core.NotFoundException>['statusCode']>().toEqualTypeOf<number>()
expectTypeOf<InstanceType<typeof Core.NotFoundException>>().toMatchTypeOf<Error>()

// Without a `Register` declaration, the native objects are `unknown`, never `any`.
expectTypeOf<Core.RequestContext['raw']>().toEqualTypeOf<unknown>()
expectTypeOf<Core.RequestContext['headers']['get']>().toEqualTypeOf<
  (name: string) => string | undefined
>()

const CurrentUser = createContextKey<{ name: string }>('CurrentUser')
declare const ctx: Core.RequestContext
expectTypeOf(ctx.get(CurrentUser)).toEqualTypeOf<{ name: string }>()
expectTypeOf(ctx.find(CurrentUser)).toEqualTypeOf<{ name: string } | undefined>()

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string() }),
  errorSchema: { 404: z.object({ message: z.string() }) },
})
// The field form infers its parameters from the built declarations.
handler(getUser, (params, context) => {
  expectTypeOf(params.urlParams.id).toEqualTypeOf<string>()
  expectTypeOf(context).toEqualTypeOf<Core.RequestContext>()
  return params.urlParams.id === '0' ? reply(404, { message: 'missing' }) : { id: '1' }
})
// @ts-expect-error the response is missing `id`
handler(getUser, () => ({}))
expectTypeOf<Core.HandlerParams<typeof getUser>>().toEqualTypeOf<{ urlParams: { id: string } }>()

// ---------------------------------------------------- @navios/adapter-fastify
expectTypeOf<ReturnType<typeof defineFastifyEnvironment>>().toEqualTypeOf<
  Core.AdapterDefinition<Fastify.FastifyEnvironment>
>()
expectTypeOf<Fastify.FastifyEnvironment['raw']['request']>().toEqualTypeOf<
  import('fastify').FastifyRequest
>()
expectTypeOf<
  Awaited<ReturnType<typeof NaviosFactory.create<Fastify.FastifyEnvironment>>>
>().toEqualTypeOf<Core.NaviosApplication<Fastify.FastifyEnvironment>>()
expectTypeOf<
  ReturnType<Core.NaviosApplication<Fastify.FastifyEnvironment>['getServer']>
>().toEqualTypeOf<import('fastify').FastifyInstance>()

// --------------------------------------------------------- @navios/react-query
expectTypeOf<ReturnType<typeof declareClient>>().toEqualTypeOf<ReactQuery.ClientInstance>()
expectTypeOf<Parameters<typeof declareClient>[0]>().toEqualTypeOf<ReactQuery.ClientOptions>()
