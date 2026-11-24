# Migrating from 1.x to 2.0

2.0 rewrites the request pipeline. Endpoint declarations made with `@navios/builder` do not change. Controllers, guards, bootstrap code and tests do.

The main ideas:

- Controllers, guards and interceptors are singletons. Per-request data lives in a `RequestContext` that is passed to them.
- One `@Endpoint` decorator serves every kind of endpoint. Body kind, response kind and status codes come from the declaration.
- Every error response is `application/problem+json` unless the endpoint declares a body for that status.
- Guards run before the request body is read.
- Any Standard Schema library works on the server. Zod keeps working unchanged.

`@navios/di` 2.0 has its own migration notes; the DI changes that affect application code are included in the table below.

## Reference table

| 1.x                                                                                                     | 2.0                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NaviosFactory.create<FastifyEnvironment>(AppModule, { adapter: defineFastifyEnvironment() })`          | `NaviosFactory.create(AppModule, { adapter: defineFastifyEnvironment() })`. The environment type is inferred from the adapter.                                    |
| `app.enableCors(options)`                                                                               | `defineFastifyEnvironment({ cors: options })` or `defineBunEnvironment({ cors: options })`                                                                        |
| `app.enableMultipart(options)`                                                                          | `defineFastifyEnvironment({ multipart: options })`, or `multipart: true`. Bun needs no option.                                                                    |
| `app.setGlobalPrefix(prefix)`                                                                           | the `globalPrefix` application option                                                                                                                             |
| `app.dispose()`                                                                                         | `app.close()`. `dispose()` remains as an alias.                                                                                                                   |
| `@Endpoint(e) async m(params: EndpointParams<typeof e>)`                                                | `@Endpoint(e) async m(params: HandlerParams<typeof e>, ctx: RequestContext)`. `m = handler(e, async (params, ctx) => ...)` is an optional alternative.            |
| `EndpointParams`, `EndpointResult` from core                                                            | `HandlerParams<typeof e>`, `HandlerResult<typeof e>`                                                                                                              |
| `@Multipart(e)`, `MultipartParams`                                                                      | `@Endpoint(e)` on an endpoint declared with `body: 'multipart'`                                                                                                   |
| `@Stream(e)`, `StreamParams`, writing to the native reply                                               | `@Endpoint(e)` on an endpoint declared with `response: 'stream'`, `'text'` or `'blob'`; return a `ReadableStream`, an async iterable, a string or a `Blob`        |
| `@HttpCode(201)`                                                                                        | `responses: { 201: schema }` in the declaration and `return reply(201, body)`                                                                                     |
| `@Header(name, value)`                                                                                  | `ctx.reply.header(name, value)`                                                                                                                                   |
| `canActivate(context: AbstractExecutionContext)`                                                        | `canActivate(ctx: RequestContext)`                                                                                                                                |
| `context.getRequest().headers[...]`                                                                     | `ctx.headers.get(name)`                                                                                                                                           |
| `context.getHandler()`, `context.getModule()`                                                           | `ctx.route`                                                                                                                                                       |
| `AttributeFactory.has(Public, handlerMetadata)`                                                         | `AttributeFactory.has(Public, ctx.route)`, which checks the handler, then the controller, then the module                                                         |
| `request.user = user`, then `inject(Request).user`                                                      | `ctx.set(CurrentUser, user)`, then `ctx.get(CurrentUser)`                                                                                                         |
| `inject(Request)`, `inject(Reply)`, `inject(FastifyRequestToken)`                                       | `ctx.raw.request`, `ctx.raw.reply`                                                                                                                                |
| a request-scoped `SessionService` or `CurrentUserService`                                               | a `@RequestValue()` class read with `ctx.get(...)`                                                                                                                |
| a request-scoped controller, or `inject(RequestScopedService)` in a controller                          | not allowed, fails at `init()`. Use `ctx.use(RequestScopedService)` in the handler, or a request value.                                                           |
| `@Module({ overrides })`                                                                                | `@Module({ providers: [provide(Token, Impl)] })`                                                                                                                  |
| `@Injectable({ priority })`, `@Injectable({ registry })`                                                | removed. Use `provide(Token, Impl)` in module or application `providers`.                                                                                         |
| `container.beginRequest(id)`                                                                            | `container.createScope()`                                                                                                                                         |
| `asyncInject(TransientService)`                                                                         | `inject(TransientService)`                                                                                                                                        |
| the validation error body (a Zod error tree)                                                            | 400 problem+json with `source` and `errors: [{ path, message }]`                                                                                                  |
| the body of an unexpected error contained `error.message`                                               | 500 problem+json with a generic `detail`. Opt in to the message with `exposeErrorDetails: true`.                                                                  |
| `definePreAdapterResolvePlugin` and the other nine stage helpers                                        | `definePlugin({ name, dependsOn?, setup(api, options) })`                                                                                                         |
| `TestingModule`                                                                                         | `NaviosFactory.create` with `defineInMemoryEnvironment()` and `providers`; `createTestClient(app)`                                                                |
| `Controller`, `Endpoint`, `Multipart`, `Stream`, `HttpCode`, `Header` from `@navios/core/legacy-compat` | `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory`, `AttributeFactory`. See [Legacy decorators](./legacy-decorators.md). |

## Bootstrap

Before:

```ts
const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
  adapter: defineFastifyEnvironment(),
})
app.setGlobalPrefix('/api')
app.enableCors({ origin: true })
app.enableMultipart({ limits: { fileSize: 10_000_000 } })
await app.init()
await app.listen({ port: 3000, host: '0.0.0.0' })
```

After:

```ts
declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    cors: { origin: true },
    multipart: { limits: { fileSize: 10_000_000 } },
  }),
  globalPrefix: '/api',
})
await app.listen({ port: 3000, host: '0.0.0.0' })
```

`listen()` initialises the application, so a separate `init()` call is not needed. The `Register` declaration is optional and types `ctx.raw` and `app.getServer()`.

## Controllers

Before:

```ts
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    const user = await this.users.find(params.urlParams.id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.users.create(params.data)
  }
}
```

After. The declaration of `createUser` changes from `responseSchema: userSchema` to `responses: { 201: userSchema }`.

```ts
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    const user = await this.users.find(urlParams.id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, await this.users.create(data))
  }
}
```

What changes in a handler:

- `EndpointParams<typeof e>` becomes `HandlerParams<typeof e>`, imported as a type from `@navios/core`.
- The method takes the `RequestContext` as an optional second parameter.
- No return annotation is needed; `@Endpoint` checks the returned value against the declaration. `HandlerResult<typeof e>` replaces `EndpointResult` where you want one. See [What `@Endpoint` checks](./controllers.md#what-endpoint-checks).

`handler()` is an optional alternative that defines a handler as a class field with inferred parameter types: `getUser = handler(getUser, async ({ urlParams }, ctx) => ...)`. It is meant for code that uses no member decorators. See [Handlers without decorators](./controllers.md#handlers-without-decorators-handler).

`throw new NotFoundException('User not found')` still works. The response body is now a problem document, `{ type, title, status, detail: 'User not found' }`, unless the endpoint declares 404 in `errorSchema`. Clients that read the old body shape need updating.

## Guards and the current user

Before:

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService)

  async canActivate(context: AbstractExecutionContext) {
    const request = context.getRequest()
    const user = await this.auth.verify(request.headers.authorization)
    if (!user) {
      throw new UnauthorizedException()
    }
    request.user = user
    return true
  }
}

// in a controller
const user = inject(Request).user
```

After:

```ts
export const CurrentUser = createContextKey<User>('CurrentUser')

@Injectable()
export class AuthGuard implements Guard {
  private readonly auth = inject(AuthService)

  async canActivate(ctx: RequestContext) {
    const user = await this.auth.verify(ctx.headers.get('authorization'))
    if (!user) {
      throw new UnauthorizedException()
    }
    ctx.set(CurrentUser, user)
    return true
  }
}

// in a controller
@Endpoint(me)
async me(_params: HandlerParams<typeof me>, ctx: RequestContext) {
  return ctx.get(CurrentUser)
}
```

Two behaviour changes to check:

- Guards are singletons. A guard that stored anything per request in a field must move it to the context.
- Guards run before the body is read and before the query is validated. A guard that inspected the parsed body has to become a check in the handler, or read what it needs from headers.

## Request-scoped services

Before, a request-scoped service injected into a controller made the controller request-scoped too:

```ts
@Injectable({ scope: InjectableScope.Request })
export class TenantService {
  private readonly request = inject(Request)
  get id() {
    return this.request.headers['x-tenant'] as string
  }
}

@Controller()
export class ItemsController {
  private readonly tenant = inject(TenantService)
}
```

After, as a request value:

```ts
@RequestValue()
export class Tenant {
  resolve(ctx: RequestContext) {
    const id = ctx.headers.get('x-tenant')
    if (!id) {
      throw new BadRequestException('Missing x-tenant header')
    }
    return id
  }
}

@Controller()
export class ItemsController {
  private readonly items = inject(ItemsService)

  @Endpoint(listItems)
  async list(_params: HandlerParams<typeof listItems>, ctx: RequestContext) {
    return this.items.list(ctx.get(Tenant))
  }
}
```

Services that used to inject the request-scoped service now take the value as an argument, as `ItemsService.list(tenantId)` does here. When passing it down is impractical, turn on `asyncContext` and read `currentContext()?.get(Tenant)`.

A class that really has to be constructed per request stays request-scoped and is reached with `ctx.use(TheClass)` in the handler. See [Per-request state](./request-state.md#request-scoped-services).

## Streams and multipart

Before:

```ts
@Stream(exportCsv)
async exportCsv(params: StreamParams<typeof exportCsv>, reply: FastifyReply) {
  reply.raw.writeHead(200, { 'content-type': 'text/csv' })
  reply.raw.write(await this.reports.csv())
  reply.raw.end()
}

@Multipart(upload)
async upload(params: MultipartParams<typeof upload>) {
  return this.files.save(params.data.file)
}
```

After:

```ts
@Endpoint(exportCsv)
async exportCsv(_params: HandlerParams<typeof exportCsv>, ctx: RequestContext) {
  ctx.reply.header('content-type', 'text/csv')
  return this.reports.csvStream() // a ReadableStream or an async iterable
}

@Endpoint(upload)
async upload({ data }: HandlerParams<typeof upload>) {
  return this.files.save(data.file)
}
```

Multipart `data` contains strings and `File` objects on both adapters.

## Plugins

Before:

```ts
export const myPlugin = definePostModulesInitPlugin()({
  name: 'my-plugin',
  register: async (context, options: MyOptions) => {
    // ...
  },
})
```

After:

```ts
export const myPlugin = definePlugin({
  name: 'my-plugin',
  setup(api, options: MyOptions) {
    api.intercept(MyInterceptor)
    api.onBootstrap((routes) => {
      // ...
    })
  },
})
```

Plugins no longer choose a stage. See [Plugins](./plugins.md).

## Tests

Before, tests usually started a server and used `supertest` against `app.getServer()`.

After:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  logger: false,
  providers: [provide(Mailer, FakeMailer)],
})
const call = createTestClient(app)

const response = await call(getUser, { urlParams: { id: '1' } })
expect(response.status).toBe(200)

await app.close()
```

`app.getServer()` still returns the native server. On Bun it exists only after `listen()`.

## Not available in 2.0

- `headersSchema` and `cookiesSchema` in a builder declaration. Read headers and cookies from `ctx`.
- A test client that returns the builder's typed result. `createTestClient` returns the raw status and body.
- Sockets on the server.
- `@navios/microservice` compiles against 2.0 but its runtime has not been ported yet.
