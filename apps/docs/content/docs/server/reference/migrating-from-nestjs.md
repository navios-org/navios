---
title: Migrating from NestJS
---

# Migrating from NestJS

Navios will look familiar to a NestJS developer: modules, controllers, injectable services, guards, interceptors and the same exception class names. The differences are in where the description of an endpoint lives and in how per-request data is reached. This page maps the concepts and then covers the differences that need more than a rename.

Navios uses standard decorators. A NestJS project compiles with `experimentalDecorators`; either turn the option off for the code you move over, or keep it and import decorators from the [legacy entry points](/docs/server/reference/legacy-decorators).

## Concept map

| NestJS                                                           | Navios 2.0                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NestFactory.create(AppModule)`, platform adapters               | `NaviosFactory.create(AppModule, { adapter })` with the [Fastify](/docs/server/adapters/fastify) or [Bun](/docs/server/adapters/bun) adapter |
| `app.setGlobalPrefix()`, `app.enableCors()`                      | the `globalPrefix` application option; the `cors` adapter option                                             |
| `@Controller('users')`                                           | `@Controller()`; the path comes from the endpoint declaration and the module's `prefix`                      |
| `@Get(':id')`, `@Post()`, ...                                    | `@Endpoint(declaration)`, with the method and URL in a Builder declaration                                   |
| DTO classes, `class-validator`, `ValidationPipe`                 | schemas in the declaration (`requestSchema`, `querySchema`, `responseSchema`)                                |
| `@Param()`, `@Query()`, `@Body()`                                | the handler's first argument: `{ urlParams, params, data }`                                                  |
| `@Req()`, `@Res()`, `@Headers()`                                 | the handler's second argument, a `RequestContext`: `ctx.headers`, `ctx.cookies`, `ctx.raw`                   |
| `@HttpCode()`, `@Header()`                                       | `responses` in the declaration with `reply(status, body)`; `ctx.reply.header()`                              |
| constructor injection, `@Inject(TOKEN)`                          | `inject(Service)`, `inject(TOKEN)` in a field initialiser                                                    |
| `{ provide, useClass \| useValue \| useFactory }`                | `provide(token, Impl)`, `provide(token, { value })`, `provide(token, { factory })`                           |
| `exports` of a module                                            | none; every provider is application-wide                                                                     |
| `forwardRef()`                                                   | `asyncInject()`                                                                                              |
| `Scope.REQUEST` providers                                        | context keys, `@RequestValue()` classes, or `ctx.use()`                                                      |
| `CanActivate`, `ExecutionContext`                                | `Guard`, `canActivate(ctx: RequestContext)`                                                                  |
| `SetMetadata()`, `Reflector`                                     | `AttributeFactory.createAttribute()`, `AttributeFactory.get(attribute, ctx.route)`                           |
| `NestInterceptor` with RxJS                                      | `Interceptor` with `intercept(ctx, next)`, where `next()` returns a promise                                  |
| pipes                                                            | schema transforms and coercion                                                                               |
| middleware                                                       | interceptors, or the server's own hooks through the adapter                                                  |
| exception filters                                                | `app.mapError(ErrorClass, mapper)` and responders                                                            |
| `OnModuleInit`, `OnModuleDestroy` on a provider                  | `onServiceInit()`, `onServiceDestroy()`                                                                      |
| `OnApplicationBootstrap`, `OnApplicationShutdown`                | `onApplicationBootstrap()`, `onApplicationShutdown()`                                                        |
| `Test.createTestingModule()`, `overrideProvider()`               | `NaviosFactory.create` with `defineInMemoryEnvironment()` and `providers: [provide(...)]`                    |
| `@nestjs/config`                                                 | `provideConfig()`                                                                                            |
| `@nestjs/jwt`, `@nestjs/schedule`, `@nestjs/swagger`             | `@navios/jwt`, `@navios/schedule`, `@navios/openapi`                                                         |

## Endpoints are declared, not decorated

In NestJS the route, the DTOs and the status code are spread over decorators on the controller method. In Navios they are one declaration, made with `@navios/builder`, that the server validates against and a client can call.

```ts title="NestJS"
export class CreateUserDto {
  @IsString() @MinLength(1) name: string
  @IsEmail() email: string
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto)
  }
}
```

```ts title="Navios"
import { builder } from '@navios/builder'
import { Controller, Endpoint, inject, reply } from '@navios/server'
import { z } from 'zod/v4'

import type { HandlerParams } from '@navios/server'

import { UsersService } from './users.service.mjs'

const API = builder()

const userSchema = z.object({ id: z.string(), name: z.string(), email: z.email() })

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responses: { 201: userSchema },
})

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, this.users.create(data))
  }
}
```

What follows from this:

- There are no DTO classes and no `ValidationPipe`. `data`, `params` and `urlParams` arrive validated and typed from the schemas. Any Standard Schema library works.
- Responses are validated too. Fields the response schema does not declare are stripped, so a `password` column cannot leak because someone returned the whole entity.
- `@Endpoint` checks the method at compile time: returning the wrong shape, or a status the declaration does not have, is a type error.
- The declarations can live in a package shared with the front end. See [Controllers and handlers](/docs/server/essentials/controllers) and [Using with Navios server](/docs/builder/guides/navios-server).

## Injection is a function call

There is no constructor injection and no `emitDecoratorMetadata`. A dependency is a field initialised with `inject()`:

```ts
import { inject, Injectable } from '@navios/server'

@Injectable()
export class UsersService {
  private readonly db = inject(DatabaseService)
  private readonly config = inject(AppConfig) // a token, where NestJS needs @Inject(TOKEN)
}
```

- A class decorated with `@Injectable()` is resolvable by being imported. It does not have to be listed in a module's `providers`.
- `providers` exists for replacing what a token resolves to: `provide(UserStore, PgUserStore)`.
- A circular dependency is detected and reported. Break it with `asyncInject()` on one side.

See [Services and injection](/docs/server/essentials/services).

## Modules group routes

A Navios module is a group of routes with a shared `prefix`, shared guards and shared interceptors. It is not an injection boundary: an application has one container, and there is no `exports`. A NestJS module that existed only to export providers has no counterpart and can be deleted; its services are imported where they are used.

Application-wide guards go into the `guards` option of `NaviosFactory.create` instead of `APP_GUARD`. See [Modules](/docs/server/essentials/modules).

## Controllers are singletons

Controllers, guards and interceptors are created once. Nothing is injected per request, and a singleton that injects a request-scoped service fails at start-up instead of silently becoming request-scoped, as a NestJS provider would.

Per-request data travels in the `RequestContext`, which guards and interceptors receive as their first argument and handlers as their second:

```ts
import { createContextKey } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

export const CurrentUser = createContextKey<{ id: string }>('CurrentUser')

// in a guard:   ctx.set(CurrentUser, user)
// in a handler:
@Endpoint(me)
async me(_params: HandlerParams<typeof me>, ctx: RequestContext) {
  return { id: ctx.get(CurrentUser).id }
}
```

This replaces `request.user`, custom parameter decorators such as `@CurrentUser()`, and most `Scope.REQUEST` providers. [Per-request state](/docs/server/guides/request-state) covers the alternatives, and [Request context](/docs/server/essentials/request-context) lists everything on `ctx`.

## Guards run before the body is read

The order of a request is guards, interceptors, validation, handler, as in NestJS, except that interceptors of the application (`app.intercept`) run around the guards. In NestJS pipes run after guards as well, but the body has already been parsed by then; in Navios it has not been read. A guard decides from headers, cookies, the route and its attributes, URL parameters and the query string, the last two as raw strings.

- A guard that needs the parsed body becomes a check in the handler.
- Only `true` lets a request through. Returning `false` answers 403; throw an exception for any other status.
- Metadata read with `Reflector` becomes an [attribute](/docs/server/guides/attributes) read from `ctx.route`.

See [Guards and interceptors](/docs/server/essentials/guards-and-interceptors) and [How a request is handled](/docs/server/request-lifecycle).

## No middleware and no pipes

| NestJS use                                         | Navios                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| logging, timing, tracing middleware                | an interceptor, attached to the application, a module, a controller or a handler                 |
| `helmet`, compression, other server-level middleware | the server's own plugins, through the Fastify adapter's `configure` option or a [plugin](/docs/server/guides/plugins) |
| `ParseIntPipe`, `ParseUUIDPipe`, `DefaultValuePipe` | the schema: `z.number()`, `z.uuid()`, `.default()`                                               |
| a custom transforming pipe                         | a schema transform, or a line in the handler                                                     |
| a response-mapping interceptor (`map()`)           | an interceptor that awaits `next()` and returns a changed result                                 |

## Errors are problem documents

The exception classes have the same names (`NotFoundException`, `BadRequestException`, and so on), but the response body differs. Navios answers every error as `application/problem+json`:

```json
{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "User not found" }
```

NestJS answers `{ "statusCode": 404, "message": "User not found", "error": "Not Found" }`. Clients that read `message` or `statusCode` need updating, or the endpoint can declare its own body for a status in `errorSchema`. Validation errors are a 400 problem with `source` and an `errors` list, and the message of an unexpected error is not sent to the client unless `exposeErrorDetails` is on.

An exception filter becomes `app.mapError(DomainError, (error, ctx) => ...)`. See [Errors](/docs/server/essentials/errors).
