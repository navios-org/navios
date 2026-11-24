// Task 8 post-build check: asserts public signatures against the BUILT
// declarations (lib/index.d.mts), so a tsdown/TS 7 emit that widens or
// re-infers types differently fails here. Never executed; type-level only.
// Run: yarn tsc -p packages/.scratch/tsconfig.json
import { expectTypeOf } from 'vitest'
import { z } from 'zod/v4'

import type * as Fastify from '../adapter-fastify/lib/index.d.mts'
import type * as Builder from '../builder/lib/index.d.mts'
import type * as Core from '../core/lib/index.d.mts'
import type * as Di from '../di/lib/index.d.mts'
import type * as ReactQuery from '../react-query/lib/index.d.mts'

// Declarations are type-only imports of the built d.mts; values are declared.
declare const inject: typeof Di.inject
declare const optional: typeof Di.optional
declare const Injectable: typeof Di.Injectable
declare const InjectionToken: typeof Di.InjectionToken
type InjectionToken<T, S extends Di.InjectionTokenSchemaType | unknown = unknown, R extends boolean = false> = Di.InjectionToken<T, S, R>
declare const builder: typeof Builder.builder
type BuilderInstance = Builder.BuilderInstance
type UrlHasParams<T extends string> = Builder.UrlHasParams<T>
type CanActivate = Core.CanActivate
declare const NaviosFactory: typeof Core.NaviosFactory
declare const defineFastifyEnvironment: typeof Fastify.defineFastifyEnvironment
declare const FastifyApplicationServiceToken: typeof Fastify.FastifyApplicationServiceToken
type FastifyApplicationServiceInterface = Fastify.FastifyApplicationServiceInterface
declare const declareClient: typeof ReactQuery.declareClient

// ---------------------------------------------------------------- @navios/di
interface FooService {
  makeFoo(): string
}
declare class Foo {
  makeFoo(): string
}

const typedToken = InjectionToken.create<FooService>(Symbol.for('foo'))
expectTypeOf(typedToken).toEqualTypeOf<InjectionToken<FooService, undefined, false>>()
expectTypeOf(inject(typedToken)).toEqualTypeOf<FooService>()
expectTypeOf(inject(Foo)).toEqualTypeOf<Foo>()
expectTypeOf(optional(Foo)).toEqualTypeOf<Foo | null>()
expectTypeOf(Injectable).returns.not.toBeAny()

// ------------------------------------------------------------ @navios/builder
const api = builder()
expectTypeOf(api).toExtend<BuilderInstance>()

const responseSchema = z.object({ id: z.string(), name: z.string() })
const querySchema = z.object({ page: z.number() })

const simple = api.declareEndpoint({ method: 'GET', url: '/users', responseSchema })
expectTypeOf(simple).toExtend<(params: {}) => Promise<z.output<typeof responseSchema>>>()
expectTypeOf(simple).returns.resolves.toEqualTypeOf<z.output<typeof responseSchema>>()

const withUrl = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema,
  responseSchema,
})
expectTypeOf<Parameters<typeof withUrl>[0]['urlParams']>().toEqualTypeOf<{
  userId: string | number
}>()
expectTypeOf<Parameters<typeof withUrl>[0]['params']>().toEqualTypeOf<{ page: number }>()
expectTypeOf(withUrl).returns.resolves.toEqualTypeOf<z.output<typeof responseSchema>>()
expectTypeOf<UrlHasParams<'/users/$userId'>>().toEqualTypeOf<true>()
expectTypeOf<UrlHasParams<'/users'>>().toEqualTypeOf<false>()
expectTypeOf(withUrl.config.url).toEqualTypeOf<'/users/$userId'>()
expectTypeOf(withUrl.config.method).toEqualTypeOf<'GET'>()

// --------------------------------------------------------------- @navios/core
declare const canActivate: CanActivate
expectTypeOf(canActivate.canActivate).parameter(0).not.toBeAny()
expectTypeOf(canActivate.canActivate).returns.toExtend<boolean | Promise<boolean>>()
expectTypeOf(NaviosFactory.create).toBeFunction()
expectTypeOf(NaviosFactory.create).parameter(0).not.toBeAny()

// ---------------------------------------------------- @navios/adapter-fastify
expectTypeOf(defineFastifyEnvironment).returns.not.toBeAny()
expectTypeOf(defineFastifyEnvironment).returns.toHaveProperty('tokens')
expectTypeOf(FastifyApplicationServiceToken).toEqualTypeOf<
  InjectionToken<FastifyApplicationServiceInterface, undefined, false>
>()

// --------------------------------------------------------- @navios/react-query
const client = declareClient({ api })
const userQuery = client.query({
  method: 'GET',
  url: '/users/$userId',
  querySchema,
  responseSchema,
})
expectTypeOf(userQuery).not.toBeAny()
expectTypeOf(userQuery.use).toBeFunction()
expectTypeOf(userQuery.use).returns.not.toBeAny()
expectTypeOf(client.mutation).toBeFunction()
