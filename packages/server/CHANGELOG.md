# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Breaking

- **A response that does not match its schema is a `ResponseValidationError`**, no longer a `ValidationError` with `source: 'response'`: what a handler returned, the body of an `HttpException` for a declared status, and the payload of `sse()`. `ValidationSource` has no `'response'`. A mapper for `ValidationError` no longer sees response errors, which stay a 500 without rethrowing them; one for `ResponseValidationError` does.

### Added

- **`ResponseValidationError`**, with the `issues` of the schema.

### Changed

- **A result of error mapping that cannot be sent is answered with a plain 500 problem**, and reported. It went to the internal-error responder first, whose result could fail as well.

### Fixed

- **An error that throws when it is looked at**, such as a `Proxy` whose traps throw, is reported and answered with a 500 in every place an error is mapped, also when an error mapper fails with one, when an interceptor leaves the handler behind, and outside a route. Some of those answered without a report, or threw.

## [2.0.0-alpha.0] - 2026-11-26

This package is new: it is the HTTP framework that `@navios/core` was in 1.x, and the entries below are the changes from `@navios/core` 1.x. `@navios/core` itself is now the part that does not depend on HTTP, and this package re-exports it.

The request pipeline, the application class and the adapter contract are rewritten. Endpoint declarations made with `@navios/builder` are unchanged. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for a 1.x to 2.0 guide.

### Breaking

- **Node.js 24 or newer is required**, or Bun 1.4.5 or newer.
- **Controllers are singletons.** A controller that injects a request-scoped service fails at `init()` with a scope mismatch. Per-request data comes from the `RequestContext` passed to each handler.
- **Guards receive a `RequestContext`** instead of `AbstractExecutionContext`: `canActivate(ctx)`. Guards are singletons, and they run before the request is validated and before the body is read. Only `true` lets a request through; 1.x accepted any truthy value.
- **Every error response is `application/problem+json`** unless the endpoint declares a body for that status in `errorSchema`. This changes the body of `HttpException` responses, validation errors (now `source` and `errors: [{ path, message }]`) and not-found responses.
- **The message of an unexpected error is no longer sent to the client.** The response is a generic 500 problem. Opt in with `exposeErrorDetails: true`.
- **Status codes come from the declaration.** `@HttpCode` is removed; declare `responses: { 201: schema }` and return `reply(201, body)`. An endpoint declared with `responses` must return `reply()`.
- **`@Multipart` and `@Stream` are removed.** `@Endpoint` and `handler()` serve every endpoint; `body: 'multipart'` and `response: 'stream' | 'text' | 'blob' | 'void'` in the declaration decide how. Stream handlers return a `ReadableStream` or an async iterable and no longer receive the native reply.
- **`EndpointParams` / `EndpointResult` are renamed** `HandlerParams` / `HandlerResult`, so that they no longer collide with the builder's client-side types.
- **`@Module({ overrides })` is removed.** Use `@Module({ providers: [provide(Token, Impl)] })`. Providers are application-wide.
- **`app.enableCors()`, `app.enableMultipart()` and `app.setGlobalPrefix()` are removed.** CORS and multipart are options of the adapter factory; the prefix is the `globalPrefix` application option.
- **Plugins have one shape.** `definePlugin({ name, dependsOn?, setup(api, options) })` replaces the ten staged `define…Plugin` helpers and the legacy `NaviosPlugin`. What belongs to HTTP is on the HTTP transport, `api.transport(httpTransport)`: `encoder`, `mapError`, `intercept`, `routes()` and `adapter`. An interceptor added with `api.intercept` wraps every handler of every transport and runs outside the ones added with `app.intercept`.
- **A path is made of whole segments.** A segment of a module prefix or of an endpoint's `url` is fixed text or a URL parameter (`$name`), and a parameter name occurs once in the whole path. Anything else (`/files/$name.json`, `/users/:id`, `/a/*`, `/opt/$id?`) fails at `init()` with the handler's name; in 1.x it meant something else on each adapter, or failed on one of them.
- **A declared `url` is served as it is written, after the prefix**, also its trailing slash: `url: '/'` in a module with the prefix `/users` is `/users/`, and `url: ''` is `/users`. That is what a client of the declaration calls with the prefix in its base URL.
- **A path that is served for other methods is a 405** with an `Allow` header, where it was a 404. `HEAD` is answered by the `GET` route, without a body.
- **A body is decoded by its media type, the same on every adapter.** `application/json` and types ending in `+json` are JSON, `text/*` is a string, and any other type, or none, is a 415 for an endpoint that reads the body, after its guards. JSON with a `__proto__` or `constructor.prototype` key is a 400. No body is `undefined`.
- **`validateResponses` is `'always'` or `'never'`.** Validation is what removes undeclared fields, so it does not depend on the environment.
- **The adapter contract is new.** It is in `@navios/server/adapter`: `HttpAdapter` (`register`, `setNotFound`, `ready`, `listen`, `inject`, `close`) with `RouteInput`, `BodySource` and `RouteResponse` replaces the handler-adapter services. Adapters written for 1.x do not work. An adapter gives the bytes of a body, or the parts of a multipart one, and the server decodes them. An executor returns an encoded response: status, checked headers with cookies and content type, a string, bytes, a `Blob`, a `ManagedBody` or nothing, and `release` when the request holds something. Interceptors, encoders, error mappers and responders work on the un-encoded `RouteResult`.
- **`@navios/server/legacy-compat` shrinks** to `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory` and `AttributeFactory`, and to `legacy`, `createClassContext` and `createMethodContext`, which adapt other decorators.
- **`@navios/di` 2.0** is re-exported, with its own breaking changes: registries and priorities are removed, a singleton cannot depend on a request-scoped service, `container.beginRequest()` is `container.createScope()`.

### Added

- **`@Endpoint` checks an unannotated method.** The returned shape, `reply()` statuses and parameter types are checked against the declaration without a return annotation; literal types are widened in that check, and `: HandlerResult<typeof endpoint>` checks them exactly. A mismatch is reported as one error.
- **`handler()` for controllers without member decorators.** `getUser = handler(getUser, ({ urlParams }, ctx) => ...)` defines a handler as a class field with parameters and return type inferred from the declaration. An options object carries `guards`, `interceptors` and `attributes`. `@Endpoint` remains the default form.
- **`RequestContext`**, passed to guards, interceptors and handlers: `id`, `method`, `path`, `url`, `ip`, `urlParams`, `query`, `route`, `headers`, `cookies`, `rawBody()`, `signal`, `reply`, `onFinish()` and `raw`.
- **`ctx.path` is the path that was matched**, in one form on every adapter, whatever the `Host` header and the request target look like, so that a guard can compare it. `ctx.url` is a `URL` with that path. A URL parameter is never `.` or `..`.
- **`ctx.rawBody()`** gives the exact bytes of the request body, before or after it is decoded, for example to check the signature of a webhook.
- **Query strings, URL parameters and multipart fields take the form their schema describes.** With a schema library that implements Standard JSON Schema, such as Zod 4, one value of an array field becomes a list, and the text of a number, a boolean or a JSON object becomes the value, so `z.number()`, `z.boolean()`, `z.array()` and `z.object()` need no coercion. In a multipart body, empty text is the `null` of a nullable field that is not a string. Text that is not exactly such a value, and a field that may be a string, is left to the schema.
- **`guards` application option**: guards of every route, also of modules that plugins add.
- **`ctx.reply`**: `header()` and `append()` take one or several values, which may be numbers, `cookie()` replaces an earlier cookie with the same name, domain and path and supports `partitioned`, and `deleteCookie()` makes the browser delete one. Names and values are checked when they are set: a header or a cookie that cannot be sent, or that a browser would misread or drop, throws.
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
- **`app.inject(request)`** handles a request in process on any adapter. `cookies` of its response is the list of the `set-cookie` values. It rejects when a stream fails after its first chunk.
- **`@navios/server/testing`**: `defineInMemoryEnvironment()`, an adapter without a server, and `createTestClient(app)`, a typed wrapper over `app.inject()`. A request is encoded and decoded as over HTTP: an object body is sent as JSON, and `FormData` reaches a multipart endpoint.
- **`@navios/server/adapter`**: the adapter contract, and what an adapter is written with: `compileRoutePath`, `canonicalPath`, `RouteTable`, `encodeResult`, `toTestMessage` and `toTestResponse` among others.
- **`@navios/server/conformance`**: `runAdapterConformance()`, the behaviour every adapter must show, run over real HTTP with any test runner, or through `inject()` for an adapter without a server. The optional `bodyLimit` option adds the cases for a request body over the adapter's limit (413 `application/problem+json`), and the optional `cors` option those for CORS.
- **`asyncContext` option and `currentContext()`** for code that cannot receive the context as an argument.
- **`validateResponses: 'always' | 'never'`** and **`exposeErrorDetails`** application options.
- **Standard Schema everywhere.** Endpoint schemas, attribute schemas and `provideConfig({ schema })` accept any Standard Schema library.
- `response: 'void'` endpoints (204, no body) and per-status `responses` endpoints.

### Changed

- **One stage order on every adapter**: interceptors of the application enter, guards, interceptors of the module, the controller and the handler enter, request validation (URL parameters, query, then body), handler, response validation, interceptors exit, error mapping.
- **Response validation is the same on every adapter** and is on by default. It strips fields the schema does not declare. A body that fails its schema is a 500.
- **Module guards and interceptors are computed per application** as a union over the import graph. Class metadata is not modified, so two applications in one process do not affect each other and the result does not depend on import order.
- **`onModuleInit` runs in dependency order**, one module at a time, imported modules first.
- **`app.close()`** waits for in-flight requests, runs shutdown hooks and disposes the container, which runs `onServiceDestroy`. `app.dispose()` is an alias.
- **`logger: false`** binds a no-op logger; an object passed as `logger` is used as the output of every injected `Logger`.
- **`provideConfig({ schema, load })`** validates the loaded value and types the service from the schema.
- **Multipart bodies** are collected into one object of strings and `File` values and validated as a whole, identically on every adapter. Several parts with one name become an array. Any other body for a multipart endpoint is a 415, and so is a multipart body for any other endpoint.
- **The `guards` and `interceptors` of `@Controller` and `handler()` are type-checked**, as those of `@UseGuards` and `@UseInterceptors`, and a `@RequestValue` class whose `dispose` does not take what its `resolve` computes does not compile. What is marked `@internal` is not in the published declarations.
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
- **An asynchronous zod refinement that rejects does not end the process**, wherever in the schema it is. Zod's `~standard.validate` validates synchronously first and drops that attempt when it meets an asynchronous check, so a rejection of the dropped check was unhandled. A schema that holds a function of the application is now run so that no attempt is dropped, and every check of a valid value runs once. A schema without one is validated as before.
- **`app.close()` disposes the container**, so `onServiceDestroy` hooks run.
- **Declaring the same method and path twice is an error at `init()`** that names both handlers.
- **Importing a module no longer changes another application's guards.**
- **A module that lists something other than a class in `controllers`**, as after an import cycle, is named by the error of `init()`.
- **A controller can override an inherited handler with another `@Endpoint`.**
- **A `method` declared in lower case is served.**
- **An empty URL parameter matches no route**: with `/users/$id` registered, `/users/` gets the not-found response on every adapter.
- **Type tests are type-checked.** Vitest's typecheck ran `tsc` with `tsconfig.lib.json`, which excludes `*.spec-d.mts`, so a type error in a type test was never reported. It now uses `tsconfig.typecheck.json`, which includes them.
- **`AttributeFactory.get` and `getAll` accept attributes created with the `AttributeFactory` of `@navios/server/legacy-compat`.** They were typed for the standard factory's attributes only and failed with TS2769.
- **A streamed body is closed whatever becomes of the response**: the client leaves, also before the first chunk, the request is a `HEAD`, an interceptor throws or answers with something else, the response cannot be sent, or the application closes. A generator runs its `finally` blocks, an iterator's `return()` is called, a web stream is cancelled and a Node stream destroyed, for `sseStream()` as well. `onFinish` callbacks run after that and the request scope is disposed last.
- **A request that holds nothing when its response is ready is finished at that moment.** Detached work that later calls `ctx.use()`, `ctx.resolve()` or reads a request value with `dispose` gets the "response has finished" error, and a late `ctx.onFinish()` callback runs at once.
- **The name of an uploaded file is the last part of the name the client sent**, on every adapter, so that it is never a path.
- **A closed application takes no request**: `app.inject()` and `app.listen()` reject.
- **A request is released before the container is disposed**, also one that `app.close()` gave up on after `shutdownTimeout`. What an `onFinish` callback or a `dispose` hook throws is logged, and what they register or compute is released too.
- **Promises of the framework are never unhandled rejections**: `ctx.resolve()`, an asynchronous request value and `next()` may be left behind by code that fails before it awaits them. An error of a `next()` that nobody waits for any more is logged.
- **`currentContext()` is the request in everything that runs for it**: the body of a stream, `onFinish` callbacks, `dispose` and `onServiceDestroy` hooks, error mappers and the log of unhandled errors.
- **`app.mapError(Error, …)` no longer takes `HttpException`, a denied guard and request validation errors.** The built-in mappings count as registered for their own classes, so a mapper for `Error` gets only what none of them handles. A mapper for `HttpException`, a subclass of it, `GuardDeniedError` or `ValidationError` still replaces the built-in.
- **An error that is answered with a status of 500 or above is logged**: an unexpected one, a thrown `HttpException`, and one that a mapper answers. Not one of work that was aborted because the client had gone.
- **An error after the first chunk of a stream is logged** with the route, once, unless the client is gone, and ends the connection. A chunk that is neither a string nor a `Uint8Array` is such an error. A stream that fails before its first chunk is an ordinary error response.
- **The body of a thrown `HttpException` on a declared status is what the `errorSchema` makes of it**, asynchronous schemas included. One that does not match is logged and answered as a problem of the same status, without the fields it was thrown with.
- **`HttpException` accepts the status of an error only** (400 to 599), and for a response a text or an object of fields.
- **A response that cannot be sent is an error of the request**: a status out of range, a header with a line break, a body without a JSON form or of a kind that cannot be written, such as a web `Response`. It goes through error mapping on every adapter.
- **Headers that describe a response are not sent with the error in its place**: `content-*`, `etag`, `last-modified`, `expires`, and a `cache-control` that lets a cache keep the response. One that only restricts, such as `private` or `no-cache`, is sent, and so is the `content-range` of a 416.
- **A header is sent once, whatever the case of its name**, and the defaults of a result (`cache-control` of an event stream, the type of a `Blob`) lose to `ctx.reply`.
- **The object body of an `HttpException` cannot replace the `status` of the problem response** (it may still set `type` and `title`). `new HttpException(403, { status: 200 })` used to answer 403 with a body that said 200.
- **An error pipeline that fails still answers**, with the release of the request. A mapper, responder, encoder or interceptor that throws, or returns something other than a response, is logged and answered as an error; all of them may return `reply()`.
- **A schema is converted to JSON Schema once**, when its route is compiled, and named, union and record schemas are understood.
- **Cookie, header, query and multipart field names such as `constructor`, `toString` and `__proto__` are plain names.**
- **`encodeSse` cannot be made to emit a forged field.** A lone carriage return in `data` starts a new `data:` line, and a line break in `id` or `event`, or a `retry` that is not a whole number, throws.
- **`@Controller` and `@Endpoint` from the main entry say what is wrong under `experimentalDecorators`** and name `@navios/server/legacy-compat`, where `@Controller` used to fail with "Cannot read properties of undefined (reading 'kind')".
- **The package publishes `lib` only** (a `files` list), and its `repository` URL is the `navios-org` one.

### Performance

Measured with `yarn bench --check` in `packages/adapter-fastify`: Node 24.22, production mode, `fastify.inject`, best of 7 rounds. The baseline is raw Fastify doing the same Zod validation by hand. Run-to-run variation is a few tenths of a microsecond.

| Case                                                  | Raw Fastify | Navios 2.0 | Overhead | 1.x overhead |
| ----------------------------------------------------- | ----------- | ---------- | -------- | ------------ |
| GET, response schema                                  | 7.40 µs     | 7.38 µs    | about 0  | +2.7 µs      |
| POST, query + body + response schema                  | 23.14 µs    | 23.40 µs   | +0.26 µs | +1.7 µs      |
| GET with one guard                                    | 7.40 µs     | 7.61 µs    | +0.21 µs | +3.5 µs      |
| GET reading one request value                         | 7.40 µs     | 7.99 µs    | +0.59 µs | n/a          |
| GET using one request-scoped service (2 dependencies) | 7.40 µs     | 8.70 µs    | +1.30 µs | +16.8 µs     |

### Added after the first 2.0 draft

- `result(kind, body)` for custom response kinds; response encoders run inside the pipeline and receive the request context.
- `registerController` and `registerModule` for code built without a decorator transform; `attributes` in controller and module options.
- `ctx.onFinish(callback)` and `ctx.responseStatus`.

### Known limitations

- `headersSchema` and `cookiesSchema` are validated by core when a declaration carries them, but `@navios/builder` does not accept them yet.
- `createTestClient` returns the raw status and body. It is not the builder client and does not validate or type the response.
- `requestScopedServices` is checked at the first `ctx.use()` of a token, not at `init()`.
- A cycle between request values is detected only when they read each other synchronously.
- An application has one HTTP transport. To serve a public and an internal port, run two applications.
