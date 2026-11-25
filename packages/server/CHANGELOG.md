# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

This package is new: it is the HTTP framework that `@navios/core` was in 1.x, and the entries below are the changes from `@navios/core` 1.x. `@navios/core` itself is now the part that does not depend on HTTP, and this package re-exports it.

The request pipeline, the application class and the adapter contract are rewritten. Endpoint declarations made with `@navios/builder` are unchanged. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for a 1.x to 2.0 guide.

### Breaking

- **Controllers are singletons.** A controller that injects a request-scoped service fails at `init()` with a scope mismatch. Per-request data comes from the `RequestContext` passed to each handler.
- **Guards receive a `RequestContext`** instead of `AbstractExecutionContext`: `canActivate(ctx)`. Guards are singletons, and they run before the request is validated and before the body is read. Only `true` lets a request through; 1.x accepted any truthy value.
- **Every error response is `application/problem+json`** unless the endpoint declares a body for that status in `errorSchema`. This changes the body of `HttpException` responses, validation errors (now `source` and `errors: [{ path, message }]`) and not-found responses.
- **The message of an unexpected error is no longer sent to the client.** The response is a generic 500 problem. Opt in with `exposeErrorDetails: true`.
- **Status codes come from the declaration.** `@HttpCode` is removed; declare `responses: { 201: schema }` and return `reply(201, body)`. An endpoint declared with `responses` must return `reply()`.
- **`@Multipart` and `@Stream` are removed.** `@Endpoint` and `handler()` serve every endpoint; `body: 'multipart'` and `response: 'stream' | 'text' | 'blob' | 'void'` in the declaration decide how. Stream handlers return a `ReadableStream` or an async iterable and no longer receive the native reply.
- **`EndpointParams` / `EndpointResult` are renamed** `HandlerParams` / `HandlerResult`, so that they no longer collide with the builder's client-side types.
- **`@Module({ overrides })` is removed.** Use `@Module({ providers: [provide(Token, Impl)] })`. Providers are application-wide.
- **`app.enableCors()`, `app.enableMultipart()` and `app.setGlobalPrefix()` are removed.** CORS and multipart are options of the adapter factory; the prefix is the `globalPrefix` application option.
- **Plugins have one shape.** `definePlugin({ name, dependsOn?, setup(api, options) })` replaces the ten staged `define…Plugin` helpers and the legacy `NaviosPlugin`.
- **The adapter contract is new.** `HttpAdapter` (`register`, `setNotFound`, `ready`, `listen`, `inject`, `close`) with `RouteInput` and `RouteResult` replaces the handler-adapter services. Adapters written for 1.x do not work.
- **`@navios/server/legacy-compat` shrinks** to `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory` and `AttributeFactory`.
- **`@navios/di` 2.0** is re-exported, with its own breaking changes: registries and priorities are removed, a singleton cannot depend on a request-scoped service, `container.beginRequest()` is `container.createScope()`.

### Added

- **`@Endpoint` checks an unannotated method.** The returned shape, `reply()` statuses and parameter types are checked against the declaration without a return annotation; literal types are widened in that check, and `: HandlerResult<typeof endpoint>` checks them exactly. A mismatch is reported as one error.
- **`handler()` for controllers without member decorators.** `getUser = handler(getUser, ({ urlParams }, ctx) => ...)` defines a handler as a class field with parameters and return type inferred from the declaration. An options object carries `guards`, `interceptors` and `attributes`. `@Endpoint` remains the default form.
- **`RequestContext`**, passed to guards, interceptors and handlers: `id`, `method`, `path`, `urlParams`, `query`, `route`, `headers`, `cookies`, `signal`, `reply.header()`, `reply.cookie()`, `onFinish()` and `raw`.
- **`Register` declaration** that types `ctx.raw` and `app.getServer()` for the application's adapter.
- **Context keys**: `createContextKey<T>(name)` with `ctx.set`, `ctx.get`, `ctx.find` and `ctx.has`, a typed way for a guard to hand data to a handler.
- **Request values**: `@RequestValue()` classes whose `resolve(ctx)` computes a value at most once per request on first `ctx.get()`, with an optional `dispose(value, ctx)`. `@Module({ requestValues })` builds them while the application initialises.
- **`ctx.use(Token)` and `ctx.resolve(Token)`** for request-scoped services. The DI scope is created on first use, so requests that do not use one have no scope. `RequestContextToken` gives the context inside such a service.
- **`requestScopedServices: 'allow' | 'warn' | 'forbid'`** application option.
- **`clientErrorStacks: 'always' | 'development' | 'never'`** application option. In production, errors that are answered with a 4xx status (`HttpException` below 500, a denied guard, a request that fails validation) no longer capture a stack by default.
- **`RouteInput.headerRecord()`**, optional for an adapter, gives a `headersSchema` the request headers without building a web `Headers` object.
- **Interceptors**: `Interceptor.intercept(ctx, next)`, attached with `app.intercept()`, `@Module({ interceptors })`, `@Controller({ interceptors })`, `@UseInterceptors()` or `handler()` options.
- **`app.mapError(ErrorClass, mapper)`** maps domain errors to responses; the most specific registered class wins.
- **`reply(status, body)` for declared error statuses.** A status in `errorSchema` can be returned with a type-checked body.
- **`TooManyRequestsException` (429) and `UnprocessableEntityException` (422).** `HttpException` now extends `Error` and accepts a `cause`.
- **`problem()`**, `ValidationError` and the replaceable responders `NotFoundResponderToken`, `ForbiddenResponderToken`, `ValidationErrorResponderToken` and `InternalServerErrorResponderToken`.
- **Server-sent events**: `sseStream(source)` answers a `response: 'stream'` endpoint with `text/event-stream`; `sse(event, payload)` creates a typed, validated event from an event declaration.
- **Module `prefix`**, composed through imports after the application's `globalPrefix`. A prefix may have URL parameters.
- **`app.routes()`** returns the compiled routes as `RouteInfo`; `ctx.route` is the same object. `AttributeFactory.get/getAll/has` read attributes from a `RouteInfo`, resolving handler, then controller, then module.
- **Lifecycle**: `onApplicationBootstrap()` and `onApplicationShutdown(signal?)` on any singleton, `app.enableShutdownHooks()`, the `shutdownTimeout` option, and `await using` support.
- **`app.inject(request)`** handles a request in process on any adapter.
- **`@navios/server/testing`**: `defineInMemoryEnvironment()`, an adapter without a server, and `createTestClient(app)`, a typed wrapper over `app.inject()`.
- **`@navios/server/conformance`**: `runAdapterConformance()`, the behaviour every adapter must show, run over real HTTP with any test runner. The optional `bodyLimit` option adds the cases for a request body over the adapter's limit (413 `application/problem+json`).
- **`asyncContext` option and `currentContext()`** for code that cannot receive the context as an argument.
- **`validateResponses: 'always' | 'development' | 'never'`** and **`exposeErrorDetails`** application options.
- **Standard Schema everywhere.** Endpoint schemas, attribute schemas and `provideConfig({ schema })` accept any Standard Schema library.
- **`createMultipartCollector(schema)`** for adapters, which builds a multipart body from parts.
- `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **One stage order on every adapter**: interceptors enter, guards, request validation (URL parameters, query, then body), handler, response validation, interceptors exit, error mapping.
- **Response validation is the same on every adapter** and is on by default. It strips fields the schema does not declare. A body that fails its schema is a 500.
- **Module guards and interceptors are computed per application** as a union over the import graph. Class metadata is not modified, so two applications in one process do not affect each other and the result does not depend on import order.
- **`onModuleInit` runs in dependency order**, one module at a time, imported modules first.
- **`app.close()`** waits for in-flight requests, runs shutdown hooks and disposes the container, which runs `onServiceDestroy`. `app.dispose()` is an alias.
- **`logger: false`** binds a no-op logger; an object passed as `logger` is used as the output of every injected `Logger`.
- **`provideConfig({ schema, load })`** validates the loaded value and types the service from the schema.
- **Multipart bodies** are collected into one object of strings and `File` values and validated as a whole, identically on every adapter.
- `zod` is no longer a dependency of `@navios/server`.

### Removed

- `@HttpCode`, `@Header`, `@Multipart`, `@Stream` and their parameter types.
- `AbstractExecutionContext`, `CanActivate`, and the `Request`, `Reply` and `ExecutionContext` injection tokens.
- `AbstractHandlerAdapterService`, `InstanceResolverService`, `GuardRunnerService`, and the endpoint, multipart and stream adapter tokens.
- The staged plugin system: `PluginStages`, the stage context types and the ten `define…Plugin` helpers.
- `TestingModule`.
- `ZodBaseEndpointOptions`, `ZodEndpointOptions` and `ZodSchemaSlots`.
- `@Module({ overrides })`, `@Injectable({ priority })` and `@Injectable({ registry })`.

### Fixed

- **Guards run before validation on every adapter.** On Fastify 1.x an unauthenticated request with an invalid body received the 400 validation response and the guard was never called.
- **A response body is validated for the status actually sent.** With `@HttpCode(201)` on Fastify 1.x the schema was registered for 200 only and a non-conforming 201 body was sent unvalidated.
- **An asynchronous zod refinement that rejects no longer ends the process.** Zod's `~standard.validate` validates synchronously first and drops that attempt when it meets an asynchronous check, so a rejection of the dropped check was unhandled. Core now validates such schemas with `safeParseAsync`, which also runs every check once per request instead of twice.
- **`app.close()` disposes the container**, so `onServiceDestroy` hooks run.
- **Declaring the same method and path twice is an error at `init()`** that names both handlers.
- **Importing a module no longer changes another application's guards.**
- **The in-memory adapter prefers a static segment to a URL parameter**, as the Fastify and Bun adapters do. It used to take the first route registered that matched, so with `/users/$userId` declared before `/users/export`, `GET /users/export` reached the param route in tests and the static route in production. The conformance suite now covers route precedence.
- **The in-memory adapter does not match a path with a trailing slash**, as on the Fastify and Bun adapters: `/users/` gets the not-found response where it used to reach the route `/users`. The conformance suite now covers it, over HTTP and with `inject()`.
- **The conformance suite checks that an empty URL parameter matches no route**: with `/users/$id` registered, `/users/` gets the not-found response.
- **Type tests are type-checked.** Vitest's typecheck ran `tsc` with `tsconfig.lib.json`, which excludes `*.spec-d.mts`, so a type error in a type test was never reported. It now uses `tsconfig.typecheck.json`, which includes them.
- **`AttributeFactory.get` and `getAll` accept attributes created with the `AttributeFactory` of `@navios/server/legacy-compat`.** They were typed for the standard factory's attributes only and failed with TS2769.

### Performance

Measured with `yarn bench --check` in `packages/adapter-fastify`: Node 24.22, production mode, `fastify.inject`, best of 7 rounds. The baseline is raw Fastify doing the same Zod validation by hand. Run-to-run variation is a few tenths of a microsecond.

| Case                                                  | Raw Fastify | Navios 2.0 | Overhead | 1.x overhead |
| ----------------------------------------------------- | ----------- | ---------- | -------- | ------------ |
| GET, response schema                                  | 7.40 µs     | 7.38 µs    | about 0  | +2.7 µs      |
| POST, query + body + response schema                  | 23.14 µs    | 23.40 µs   | +0.26 µs | +1.7 µs      |
| GET with one guard                                    | 7.40 µs     | 7.61 µs    | +0.21 µs | +3.5 µs      |
| GET reading one request value                         | 7.40 µs     | 7.99 µs    | +0.59 µs | n/a          |
| GET using one request-scoped service (2 dependencies) | 7.40 µs     | 8.70 µs    | +1.30 µs | +16.8 µs     |

- ESM output is 78 KB, down from 298 KB.

### Added after the first 2.0 draft

- `result(kind, body)` for custom response kinds; response encoders run inside the pipeline and receive the request context.
- `registerController` and `registerModule` for code built without a decorator transform; `attributes` in controller and module options.
- `ctx.onFinish(callback)` and `ctx.responseStatus`.

### Known limitations

- `headersSchema` and `cookiesSchema` are validated by core when a declaration carries them, but `@navios/builder` does not accept them yet.
- `createTestClient` returns the raw status and body. It is not the builder client and does not validate or type the response.
- `requestScopedServices` is checked at the first `ctx.use()` of a token, not at `init()`.
- A cycle between request values is detected only when they read each other synchronously.
- `@navios/otel*`, `@navios/openapi*`, `@navios/adapter-xml`, `@navios/schedule`, `@navios/queues`, `@navios/microservice` and `@navios/jwt` are not ported to this version yet.
