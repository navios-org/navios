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
expectTypeOf(api).toEqualTypeOf<Builder.BuilderInstance<false>>()

const responseSchema = z.object({ id: z.string(), name: z.string() })
const querySchema = z.object({ page: z.number() })
type Response = { id: string; name: string }

const simple = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema })
expectTypeOf<ReturnType<typeof simple>>().toEqualTypeOf<Promise<Response>>()
expectTypeOf<keyof Parameters<typeof simple>[0]>().toEqualTypeOf<'headers' | 'signal'>()
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

// --------------------------------------------------------------- @navios/core
expectTypeOf<ReturnType<Core.CanActivate['canActivate']>>().toEqualTypeOf<
  boolean | Promise<boolean>
>()
expectTypeOf<Parameters<Core.CanActivate['canActivate']>>().toEqualTypeOf<
  [executionContext: Core.AbstractExecutionContext]
>()
expectTypeOf<ReturnType<typeof NaviosFactory.create>>().toEqualTypeOf<
  Promise<Core.NaviosApplication<Core.DefaultAdapterEnvironment>>
>()
expectTypeOf<Parameters<typeof NaviosFactory.create>[1]>().toEqualTypeOf<
  Core.NaviosApplicationOptions | undefined
>()
expectTypeOf<InstanceType<typeof Core.NotFoundException>['statusCode']>().toEqualTypeOf<number>()

// ---------------------------------------------------- @navios/adapter-fastify
expectTypeOf<ReturnType<typeof defineFastifyEnvironment>>().toEqualTypeOf<{
  tokens: Map<Di.InjectionToken<any, undefined, false>, Di.AnyInjectableType>
}>()
expectTypeOf<typeof Fastify.FastifyApplicationServiceToken>().toEqualTypeOf<
  Di.InjectionToken<Fastify.FastifyApplicationServiceInterface, undefined, false>
>()
expectTypeOf<typeof Fastify.FastifyEndpointAdapterToken>().toEqualTypeOf<
  Di.InjectionToken<Fastify.FastifyEndpointAdapterService, undefined, false>
>()
expectTypeOf<Fastify.FastifyApplicationServiceInterface['initServer']>().toEqualTypeOf<
  () => Promise<void>
>()

// --------------------------------------------------------- @navios/react-query
expectTypeOf<ReturnType<typeof declareClient<false>>>().toEqualTypeOf<
  ReactQuery.ClientInstance<false>
>()
expectTypeOf<ReturnType<typeof declareClient<true>>>().toEqualTypeOf<
  ReactQuery.ClientInstance<true>
>()
expectTypeOf<Parameters<typeof declareClient<false>>[0]>().toEqualTypeOf<
  ReactQuery.ClientOptions<false>
>()
