---
title: Migrating to 2.0
---

# Migrating to 2.0

This page lists what changed between `@navios/core` 1.x and `@navios/server` 2.0, the Fastify and Bun adapters, `@navios/jwt`, `@navios/schedule`, `@navios/openapi`, `@navios/otel` and `@navios/adapter-xml`. Upgrade them together. The packages that take part in HTTP require `@navios/server` 2.0; `@navios/jwt`, `@navios/schedule` and the main entry of `@navios/otel` require only `@navios/core` 2.0.

2.0 rewrites the request pipeline. Endpoint declarations made with `@navios/builder` stay as they are apart from the changes in [Builder's migration page](/docs/builder/reference/migrating-to-2). Controllers, guards, bootstrap code and tests change. The main ideas:

- Controllers, guards and interceptors are singletons. Per-request data lives in a `RequestContext` that is passed to them.
- One `@Endpoint` decorator serves every kind of endpoint. Body kind, response kind and status codes come from the declaration.
- Every error response is `application/problem+json` unless the endpoint declares a body for that status.
- Guards run before the request body is read.
- Any Standard Schema library works on the server. Zod keeps working unchanged.
- CORS, multipart, OpenAPI, OpenTelemetry and XML are configured the same way on every adapter.
- The HTTP framework is now `@navios/server`. `@navios/core` is the part that does not depend on HTTP.

## The package is now `@navios/server`

In 1.x `@navios/core` was the HTTP framework. In 2.0 it is split in two:

- `@navios/core` holds what an application is made of whatever reaches it: dependency injection, modules, plugins, lifecycle, configuration and logging.
- `@navios/server` is the HTTP framework on top of it: controllers, endpoints, the request pipeline, adapters and `NaviosFactory`. It re-exports everything from `@navios/core`.

For an HTTP application the change is the package name:

```diff
- npm install @navios/core
+ npm install @navios/server
```

```diff
- import { Controller, inject, Injectable, Module, NaviosFactory } from '@navios/core'
+ import { Controller, inject, Injectable, Module, NaviosFactory } from '@navios/server'
```

The same goes for the entry points `@navios/core/testing` and `@navios/core/legacy-compat`, and for the `Register` declaration, which is now written `declare module '@navios/server'`.

Packages that do not need HTTP depend on `@navios/core` alone: `@navios/jwt`, `@navios/schedule` and the main entry of `@navios/otel`. An application can also run without HTTP, or with HTTP and something else side by side; see [Other transports](/docs/server/guides/other-transports).

## What changed

### Application and adapters

| 1.x                                                                                            | 2.0                                                                                                             |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NaviosFactory.create<FastifyEnvironment>(AppModule, { adapter: defineFastifyEnvironment() })` | `NaviosFactory.create(AppModule, { adapter: defineFastifyEnvironment() })`, typed by the `Register` declaration |
| `app.enableCors(options)`                                                                      | `defineFastifyEnvironment({ cors: options })` or `defineBunEnvironment({ cors: options })`                      |
| `app.enableMultipart(options)`                                                                 | `defineFastifyEnvironment({ multipart: options })`, or `multipart: true`. Bun needs no option.                  |
| `app.setGlobalPrefix(prefix)`                                                                  | the `globalPrefix` application option                                                                           |
| `app.init()` before `app.listen()`                                                             | `app.listen()` initialises the application                                                                      |
| `app.dispose()`                                                                                | `app.close()`. `dispose()` remains as an alias.                                                                 |
| Fastify schema validation, `fastify-type-provider-zod`                                         | not used. Validation happens in `@navios/server`, the same on both adapters.                                                |
| response validation off by default on Bun                                                      | on by default on every adapter (`validateResponses: 'always'`)                                                  |

### Controllers and handlers

| 1.x                                                       | 2.0                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `async m(params: EndpointParams<typeof e>)`               | `async m(params: HandlerParams<typeof e>, ctx: RequestContext)`                                                                                            |
| `EndpointParams`, `EndpointResult` from core              | `HandlerParams<typeof e>`, `HandlerResult<typeof e>`                                                                                                       |
| `@Multipart(e)`, `MultipartParams`                        | `@Endpoint(e)` on an endpoint declared with `body: 'multipart'`                                                                                            |
| `@Stream(e)`, `StreamParams`, writing to the native reply | `@Endpoint(e)` on an endpoint declared with `response: 'stream'`, `'text'` or `'blob'`; return a `ReadableStream`, an async iterable, a string or a `Blob` |
| `@HttpCode(201)`                                          | `responses: { 201: schema }` in the declaration and `return reply(201, body)`                                                                              |
| `@Header(name, value)`                                    | `ctx.reply.header(name, value)`                                                                                                                            |
| a request-scoped controller                               | not allowed, fails at `init()`. Controllers are singletons.                                                                                                |

### Guards and request data

| 1.x                                                               | 2.0                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CanActivate`, `canActivate(context: AbstractExecutionContext)`   | `Guard`, `canActivate(ctx: RequestContext)`                                                               |
| any truthy return value lets the request through                  | only `true` does                                                                                          |
| `context.getRequest().headers[...]`                               | `ctx.headers.get(name)`                                                                                   |
| `context.getHandler()`, `context.getModule()`                     | `ctx.route`                                                                                               |
| `AttributeFactory.has(Public, handlerMetadata)`                   | `AttributeFactory.has(Public, ctx.route)`, which checks the handler, then the controller, then the module |
| `request.user = user`, then `inject(Request).user`                | `ctx.set(CurrentUser, user)`, then `ctx.get(CurrentUser)`                                                 |
| `inject(Request)`, `inject(Reply)`, `inject(FastifyRequestToken)` | `ctx.raw.request`, `ctx.raw.reply` (Fastify); `ctx.raw.request`, `ctx.raw.server` (Bun)                   |
| a request-scoped `SessionService` or `CurrentUserService`         | a `@RequestValue()` class read with `ctx.get(...)`                                                        |
| `inject(RequestScopedService)` in a controller or guard           | `ctx.use(RequestScopedService)` in the handler, or a request value                                        |

### Dependency injection

These are the DI changes that show up in server code. [DI's migration page](/docs/di/reference/migrating-to-2) has the full list.

| 1.x                                                                        | 2.0                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@Module({ overrides })`                                                   | `@Module({ providers: [provide(Token, Impl)] })`. Providers are application-wide.   |
| `@Injectable({ priority })`, `@Injectable({ registry })`, `new Registry()` | removed. Use `provide(Token, Impl)` in module or application `providers`.           |
| a singleton that injected a request-scoped service became request-scoped   | a `DIError` with code `ScopeMismatchError`                                          |
| `container.beginRequest(id)`, `scoped.endRequest()`                        | `container.createScope()`, `scope.dispose()`                                        |
| `asyncInject(TransientService)`                                            | `inject(TransientService)`. `asyncInject` is only needed for circular dependencies. |
| `optional(Service)` returned `null` on any failure                         | `null` only when nothing provides the token                                         |
| Zod-only token schemas                                                     | any Standard Schema                                                                 |

### Errors, plugins and tests

| 1.x                                                                                                     | 2.0                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the validation error body (a Zod error tree)                                                            | 400 problem+json with `source` and `errors: [{ path, message }]`                                                                                                                    |
| the body of an `HttpException`                                                                          | problem+json, unless the endpoint declares the status in `errorSchema`                                                                                                              |
| the body of an unexpected error contained `error.message`                                               | 500 problem+json with a generic `detail`. Opt in to the message with `exposeErrorDetails: true`.                                                                                    |
| a denied guard answered with the text `Forbidden` (Bun)                                                 | 403 problem+json                                                                                                                                                                    |
| a handler result that failed its response schema was a 400 (Bun)                                        | a 500                                                                                                                                                                               |
| `definePreAdapterResolvePlugin` and the other nine stage helpers                                        | `definePlugin({ name, dependsOn?, setup(api, options) })`                                                                                                                           |
| `TestingModule`                                                                                         | `NaviosFactory.create` with `defineInMemoryEnvironment()` and `providers`; `createTestClient(app)`                                                                                  |
| `Controller`, `Endpoint`, `Multipart`, `Stream`, `HttpCode`, `Header` from `@navios/server/legacy-compat` | `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory`, `AttributeFactory`. See [Legacy decorators](/docs/server/reference/legacy-decorators). |

### @navios/jwt

| 1.x                                                                                                            | 2.0                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `provideJwtService(async () => { const config = await inject(ConfigService) ... })`                            | the factory receives a `FactoryContext`: `async (ctx) => { const config = await ctx.inject(ConfigService) ... }`. It may be synchronous. |
| the Zod schemas `AlgorithmType`, `JwtHeaderSchema`, `SignOptionsSchema`, `VerifyOptionsSchema`, `SecretSchema` | removed. Use the types `Algorithm`, `JwtHeader`, `SignOptions`, `VerifyOptions`, `Secret`.                                               |
| `JwtServiceOptionsSchema.parse(...)`                                                                           | `JwtServiceOptionsSchema` is a Standard Schema without Zod methods, and it does not strip unknown keys                                   |
| `zod` as a peer dependency                                                                                     | not required                                                                                                                             |

### @navios/schedule

| 1.x                                                             | 2.0                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `schedulerService.register(Service)` started the jobs           | jobs start at the end of `app.init()`. A service registered after that starts immediately. |
| registering in a module's `onModuleInit`                        | still works; `schedulePlugin({ services: [Service] })` does the same without the hook      |
| jobs kept running until `stopAll()`                             | `app.close()` stops every job and waits for runs in progress                               |
| `@Schedulable({ registry })`                                    | `@Schedulable({ scope })`                                                                  |
| runs were not scoped                                            | every run has its own DI scope; a request-scoped `@Schedulable` class is built per run     |
| a scheduler used without an application started on `register()` | call `schedulerService.start()`                                                            |
| an HTTP adapter was needed to run jobs                          | `createApplication(AppModule, { plugins: [schedulePlugin(...)] })` runs them with no adapter |

### @navios/openapi

| 1.x                                                                                                                             | 2.0                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `defineOpenApiPlugin` from `@navios/openapi-fastify` / `@navios/openapi-bun`                                                    | `openApiPlugin` from `@navios/openapi`. The adapter packages are deprecated re-exports.          |
| Fastify: `/docs` ignored the global prefix                                                                                      | the plugin's routes get the global prefix on every adapter                                       |
| `servers` defaulted to the global prefix                                                                                        | documented paths contain the prefix; `servers` is only what you configure                        |
| `@Stream` + `@ApiStream`, `@Multipart`, `@HttpCode`                                                                             | the declaration decides: `response: 'stream'`, `body: 'multipart'`, `responses: { 201: schema }` |
| `OpenApiGeneratorService`, `EndpointScannerService`, `PathBuilderService`, `MetadataExtractorService`, `SchemaConverterService` | `generateOpenApiDocument`, `extractOpenApiMetadata`, `SchemaConverter`                           |
| Zod only, through `zod-openapi`                                                                                                 | any Standard Schema that can produce JSON Schema, or the `toJsonSchema` option                   |
| option schemas (`scalarOptionsSchema`, ...)                                                                                     | removed; options are plain TypeScript types                                                      |

### @navios/otel

| 1.x                                                                                                | 2.0                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `defineOtelPlugin(options)` from `@navios/otel-fastify` / `@navios/otel-bun`                       | `otelPlugin(options)` from `@navios/otel`. The adapter packages are deprecated re-exports. |
| `app.usePlugin(defineOtelTracingPlugin({}))`                                                       | not needed; `otelPlugin` traces `@Traced` services                                         |
| `request.otelSpan` (Fastify)                                                                       | `ctx.find(RequestSpan)`                                                                    |
| `autoInstrument.handlers` / `guards`, `propagateContext`, `metrics.requestDuration` / `errorCount` | removed. One server span covers guards, validation and the handler.                        |
| `OtelHttpInterceptor`, `compileIgnoreRoutes` from `@navios/otel`                                   | from `@navios/otel/http`. The main entry no longer needs `@navios/server`.                 |
| a span for a request that matched no route (Fastify), `guard:<name>` child spans (Bun)             | removed                                                                                    |
| the `http.url` span attribute                                                                      | holds the request path, without the query string                                           |
| `getSpanContextStore()`                                                                            | removed; the active span lives in the OpenTelemetry context                                |
| `createTracedWrapperFactory()`                                                                     | removed; use `traceInstance()`                                                             |
| `container.get(OtelSetupService)` then `initialize()` / `shutdown()`                               | done by the plugin                                                                         |

### @navios/adapter-xml

| 1.x                                                                                   | 2.0                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter: [defineFastifyEnvironment(), defineXmlEnvironment()]`                       | `adapter: defineFastifyEnvironment(), plugins: [xmlPlugin()]`                                                                            |
| `declareXmlStream({ method, url, contentType, xmlDeclaration, encoding })`            | `declareEndpoint({ method, url, response: 'text' })`; the XML options go to `xml()` or `xmlPlugin()`                                     |
| `@XmlStream(endpoint)`, `XmlStreamParams`                                             | `@Endpoint(endpoint)`, `HandlerParams`. There is no deprecated alias, because its options came from `declareXmlStream`                   |
| handler returns the JSX tree                                                          | handler returns `xml(tree, { contentType })`                                                                                             |
| `xmlDeclaration: false`, `@HttpCode(201)`                                             | `xml(tree, { declaration: false, status: 201 })`                                                                                         |
| `@Component({ registry })`, `XmlStreamAdapterService`, core's `XmlStreamAdapterToken` | removed                                                                                                                                  |
| `render()` in a class component                                                       | `render(ctx: RequestContext)`; a `render()` without the parameter still works                                                            |
| `defineTag(name, zodObject)`, `@Component({ schema: zodObject })`                     | unchanged for Zod; any Standard Schema is accepted, and `zod` is no longer a dependency of the package                                   |
| component classes are request-scoped and inject request-scoped services               | components are transient; `inject()` reaches singletons, request data comes from `render(ctx)` through `ctx.get(...)` and `ctx.use(...)` |
| function components run while the JSX expression is evaluated                         | they run when the tree is rendered and receive `ctx` as second argument                                                                  |
| the content type is sent exactly as configured                                        | `; charset=utf-8` is added when it names no charset                                                                                      |
| `renderToXml(tree, { container: container.beginRequest(id) })`                        | `renderToXml(tree, { container, ctx? })`                                                                                                 |

## Bootstrap

```diff
- const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
-   adapter: defineFastifyEnvironment(),
- })
- app.setGlobalPrefix('/api')
- app.enableCors({ origin: true })
- app.enableMultipart({ limits: { fileSize: 10_000_000 } })
- await app.init()
+ declare module '@navios/server' {
+   interface Register {
+     environment: FastifyEnvironment
+   }
+ }
+
+ const app = await NaviosFactory.create(AppModule, {
+   adapter: defineFastifyEnvironment({
+     cors: { origin: true },
+     multipart: { limits: { fileSize: 10_000_000 } },
+   }),
+   globalPrefix: '/api',
+ })
  await app.listen({ port: 3000, host: '0.0.0.0' })
```

The `Register` declaration is optional and types `ctx.raw` and `app.getServer()`. The adapter pages list every option: [Fastify](/docs/server/adapters/fastify), [Bun](/docs/server/adapters/bun).

## Controllers

The declaration of `createUser` changes from `responseSchema: userSchema` to `responses: { 201: userSchema }`.

```diff
  @Controller()
  export class UsersController {
    private readonly users = inject(UsersService)

    @Endpoint(getUser)
-   async getUser(params: EndpointParams<typeof getUser>) {
-     const user = await this.users.findById(params.urlParams.userId)
+   async getUser({ urlParams }: HandlerParams<typeof getUser>) {
+     const user = await this.users.findById(urlParams.userId)
      if (!user) {
        throw new NotFoundException('User not found')
      }
      return user
    }

    @Endpoint(createUser)
-   @HttpCode(201)
-   async createUser(params: EndpointParams<typeof createUser>) {
-     return this.users.create(params.data)
+   async createUser({ data }: HandlerParams<typeof createUser>) {
+     return reply(201, await this.users.create(data))
    }
  }
```

- The method takes the `RequestContext` as an optional second parameter.
- No return annotation is needed; `@Endpoint` checks the returned value against the declaration.
- `handler()` is an optional alternative that defines a handler as a class field with inferred parameter types: `getUser = handler(getUser, async ({ urlParams }, ctx) => ...)`.
- `throw new NotFoundException('User not found')` still works, but the response body is now a problem document, `{ type, title, status, detail }`, unless the endpoint declares 404 in `errorSchema`. Clients that read the old body shape need updating.

See [Controllers and handlers](/docs/server/essentials/controllers) and [Errors](/docs/server/essentials/errors).

## Guards and the current user

```diff
+ export const CurrentUser = createContextKey<User>('CurrentUser')
+
  @Injectable()
- export class AuthGuard implements CanActivate {
+ export class AuthGuard implements Guard {
    private readonly auth = inject(AuthService)

-   async canActivate(context: AbstractExecutionContext) {
-     const request = context.getRequest()
-     const user = await this.auth.verify(request.headers.authorization)
+   async canActivate(ctx: RequestContext) {
+     const user = await this.auth.verify(ctx.headers.get('authorization'))
      if (!user) {
        throw new UnauthorizedException()
      }
-     request.user = user
+     ctx.set(CurrentUser, user)
      return true
    }
  }

  // in a controller
- const user = inject(Request).user
+ @Endpoint(me)
+ async me(_params: HandlerParams<typeof me>, ctx: RequestContext) {
+   return ctx.get(CurrentUser)
+ }
```

Two behaviour changes to check:

- Guards are singletons. A guard that stored anything per request in a field must move it to the context.
- Guards run before the body is read and before the query is validated. A guard that inspected the parsed body has to become a check in the handler, or read what it needs from headers.

See [Guards and interceptors](/docs/server/essentials/guards-and-interceptors) and [Authentication with JWT](/docs/server/guides/authentication).

## Request-scoped services

In 1.x a request-scoped service injected into a controller made the controller request-scoped too. In 2.0 that fails at `init()`. Most such services become a request value:

```diff
- @Injectable({ scope: InjectableScope.Request })
- export class TenantService {
-   private readonly request = inject(Request)
-   get id() {
-     return this.request.headers['x-tenant'] as string
-   }
- }
+ @RequestValue()
+ export class Tenant {
+   resolve(ctx: RequestContext) {
+     const id = ctx.headers.get('x-tenant')
+     if (!id) {
+       throw new BadRequestException('Missing x-tenant header')
+     }
+     return id
+   }
+ }

  @Controller()
  export class ItemsController {
-   private readonly tenant = inject(TenantService)
+   private readonly items = inject(ItemsService)
+
+   @Endpoint(listItems)
+   async list(_params: HandlerParams<typeof listItems>, ctx: RequestContext) {
+     return this.items.list(ctx.get(Tenant))
+   }
  }
```

Services that used to inject the request-scoped service now take the value as an argument, as `ItemsService.list(tenantId)` does here. When passing it down is impractical, turn on `asyncContext` and read `currentContext()?.get(Tenant)`. A class that really has to be constructed per request stays request-scoped and is reached with `ctx.use(TheClass)` in the handler. See [Per-request state](/docs/server/guides/request-state).

## Streams and multipart

```diff
- @Stream(exportCsv)
- async exportCsv(params: StreamParams<typeof exportCsv>, reply: FastifyReply) {
-   reply.raw.writeHead(200, { 'content-type': 'text/csv' })
-   reply.raw.write(await this.reports.csv())
-   reply.raw.end()
- }
+ @Endpoint(exportCsv)
+ async exportCsv(_params: HandlerParams<typeof exportCsv>, ctx: RequestContext) {
+   ctx.reply.header('content-type', 'text/csv')
+   return this.reports.csvStream() // a ReadableStream or an async iterable
+ }

- @Multipart(upload)
- async upload(params: MultipartParams<typeof upload>) {
-   return this.files.save(params.data.file)
- }
+ @Endpoint(upload)
+ async upload({ data }: HandlerParams<typeof upload>) {
+   return this.files.save(data.file)
+ }
```

The declarations carry the kind: `response: 'stream'` on `exportCsv` and `body: 'multipart'` on `upload`. Multipart `data` contains strings and `File` objects on both adapters. See [Streams and server-sent events](/docs/server/guides/streams-and-sse) and [File uploads](/docs/server/guides/file-uploads).

## Plugins

Plugins no longer choose a stage. The same shape applies to the plugins of `@navios/openapi`, `@navios/otel`, `@navios/schedule` and `@navios/adapter-xml`, which are all passed in `plugins`.

```diff
- export const myPlugin = definePostModulesInitPlugin()({
-   name: 'my-plugin',
-   register: async (context, options: MyOptions) => {
-     // ...
-   },
- })
+ export const myPlugin = definePlugin({
+   name: 'my-plugin',
+   setup(api, options: MyOptions) {
+     api.intercept(MyInterceptor)
+     api.onBootstrap(() => {
+       const routes = api.transport(httpTransport)?.routes()
+       // ...
+     })
+   },
+ })
```

```diff
  const app = await NaviosFactory.create(AppModule, {
-   adapter: [defineFastifyEnvironment(), defineXmlEnvironment()],
+   adapter: defineFastifyEnvironment(),
+   plugins: [
+     xmlPlugin(),
+     openApiPlugin({ info: { title: 'Users API', version: '1.0.0' } }),
+     otelPlugin({ serviceName: 'users-api', exporter: 'otlp' }),
+     schedulePlugin({ services: [CleanupService] }),
+   ],
  })
- app.usePlugin(defineOpenApiPlugin({ info: { title: 'Users API', version: '1.0.0' } }))
- app.usePlugin(defineOtelPlugin({ serviceName: 'users-api', exporter: 'otlp' }))
- app.usePlugin(defineOtelTracingPlugin({}))
```

See [Plugins](/docs/server/guides/plugins).

## Tests

Tests that started a server and used `supertest` against `app.getServer()` can run in process instead:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  logger: false,
  providers: [provide(Mailer, FakeMailer)],
})
const call = createTestClient(app)

const response = await call(getUser, { urlParams: { userId: '1' } })
expect(response.status).toBe(200)

await app.close()
```

`app.getServer()` still returns the native server. On Bun it exists only after `listen()`. See [Testing](/docs/server/essentials/testing).

## Not available in 2.0

- A test client that returns the builder's typed result. `createTestClient` returns the raw status and body.
- Sockets on the server.
- `@navios/cli` hot reload. The CLI has not been ported to 2.0.
