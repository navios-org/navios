# Controllers and handlers

A controller is a class decorated with `@Controller()`. Each handler in it serves one endpoint declared with `@navios/builder`.

Controllers are singletons. Core creates each controller once at `init()`, finds its handlers and compiles one function per route, so nothing is constructed per request. Per-request data comes from the [`RequestContext`](./request-context.md) passed to every handler. A controller that injects a request-scoped service fails at `init()` with a scope mismatch error that names the path (for example `UsersController -> UnitOfWork`).

The examples on this page use these declarations:

```ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const api = builder()
const userSchema = z.object({ id: z.string(), name: z.string() })

export const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

export const listUsers = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ limit: z.coerce.number().default(10) }),
  responseSchema: z.array(userSchema),
})

export const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string().min(1) }),
  responses: { 201: userSchema },
})
```

## Handlers: `@Endpoint`

A handler is a method decorated with `@Endpoint(declaration)`.

```ts
import { Controller, Endpoint, inject, reply } from '@navios/core'

import type { HandlerParams, RequestContext } from '@navios/core'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    const user = await this.users.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(listUsers)
  async listUsers({ params }: HandlerParams<typeof listUsers>) {
    return this.users.list(params.limit)
  }

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, await this.users.create(data.name))
  }
}
```

- The first parameter is annotated with `HandlerParams<typeof endpoint>`. TypeScript does not infer a method's parameter types from a decorator, so the annotation is needed. It contains `urlParams` (path parameters), `params` (the validated query) and `data` (the validated body). A key is present only when the declaration has the matching part.
- The second parameter, `ctx: RequestContext`, is optional. A handler that needs neither takes no parameters.
- No return annotation is needed. `@Endpoint` checks the method against the declaration; see [What `@Endpoint` checks](#what-endpoint-checks).
- The method may be `async` or not.
- The route's `handlerName` is the method name.

### Guards, interceptors and attributes on a handler

They are decorators on the method:

```ts
@UseGuards(RolesGuard)
@UseInterceptors(AuditInterceptor)
@Roles(['admin'])
@Endpoint(adminOnly)
async admin(_params: HandlerParams<typeof adminOnly>, ctx: RequestContext) {
  return { name: ctx.get(CurrentUser).name }
}

@Public()
@Endpoint(ping)
ping() {
  return { ok: true }
}
```

Their order relative to `@Endpoint` does not matter. A method that has `@UseGuards`, `@UseInterceptors` or an attribute but no `@Endpoint` fails at `init()`. See [Guards and interceptors](./guards-and-interceptors.md) and [Attributes](./attributes.md).

### What `@Endpoint` checks

`@Endpoint` is a compile error when the method does not fit the declaration:

- a parameter type that is not the declared one,
- a returned value of the wrong shape,
- `reply()` with a status the endpoint does not declare, or with the wrong body for that status,
- a bare value from an endpoint declared with `responses`, or a non-stream from a `response: 'stream'` endpoint.

Literal types are widened in this check: a field declared as `'low' | 'high'` is checked as `string`. TypeScript does not pass an expected type into the body of a decorated method, so `return { priority: 'high' }` is inferred as `{ priority: string }`, and a check against the literal type would reject it.

To have literal values (enums, discriminators) checked too, annotate the return type with `HandlerResult<typeof endpoint>`:

```ts
import type { HandlerResult } from '@navios/core'

// getTask declares `priority: z.enum(['low', 'high'])`
@Endpoint(getTask)
async getTask({ urlParams }: HandlerParams<typeof getTask>): HandlerResult<typeof getTask> {
  return { state: 'open', priority: 'urgent' } // compile error: not a declared priority
}
```

Without the annotation, a wrong literal value is still caught at run time by [response validation](#response-validation).

## Controller options

```ts
@Controller({ guards: [AuthGuard], interceptors: [TimingInterceptor] })
export class AccountController {}
```

`@UseGuards(...)` and `@UseInterceptors(...)` on the class do the same. Place them above `@Controller`. The options also accept `attributes`, an array of attribute values such as `[Public()]`.

A controller has no path of its own. Path prefixes belong to [modules](./modules.md).

## Handlers without decorators: `handler()`

`handler()` defines a handler as a class field instead of a decorated method. It produces the same route as `@Endpoint`, and one controller can mix both. Use it when:

- the code uses no member decorators at all, for example a library built without a decorator transform (see [Without decorator syntax](#without-decorator-syntax) below), or
- you prefer inferred parameter types to the `HandlerParams` annotation.

```ts
import { Controller, handler, inject, reply } from '@navios/core'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, async ({ urlParams }, ctx) => {
    const user = await this.users.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  })

  listUsers = handler(listUsers, ({ params }) => this.users.list(params.limit))

  createUser = handler(createUser, async ({ data }) => {
    return reply(201, await this.users.create(data.name))
  })
}
```

- Both arguments of the function are inferred from the declaration: the first is what `HandlerParams<typeof endpoint>` describes, the second is the `RequestContext`. Nothing is annotated.
- The return value is checked against the declaration, including literal values. No widening is needed here, because TypeScript passes the expected type into the function.
- `this` inside an arrow function is the controller, so `inject()` fields work. A `function` or an `async function*` passed to `handler()` has no `this`; to use controller fields in a generator, return one from an arrow function: `handler(ticks, () => this.generate())`.
- The route's `handlerName` is the property name.
- Core finds these handlers on the controller instance. It creates the singleton at `init()` and reads its own properties, so a `handler()` field must be assigned when the constructor finishes. A static or prototype property is not found.

Guards, interceptors and attributes for one handler go in an options object between the endpoint and the function:

```ts
admin = handler(
  adminOnly,
  { guards: [RolesGuard], interceptors: [AuditInterceptor], attributes: [Roles(['admin'])] },
  (_params, ctx) => ({ name: ctx.get(CurrentUser).name }),
)
```

`attributes` takes attribute values, which is what calling an attribute returns: `[Public()]`, `[Roles(['admin'])]`.

`@UseGuards`, `@UseInterceptors` and attribute decorators also work on a `handler()` field. Guards and interceptors from decorators run before those from the options. When the same attribute is set both ways, the value from the options wins.

### Without decorator syntax

`registerController` and `registerModule` register a class without `@Controller` and `@Module`. Together with `handler()` fields (and `registerInjectable` for services) an application or a library needs no decorators:

```ts
import { handler, registerController, registerModule } from '@navios/core'

class DocsController {
  spec = handler(specEndpoint, () => document)
}
registerController(DocsController, { attributes: [Public()] })

class DocsModule {}
registerModule(DocsModule, { controllers: [DocsController] })
```

`registerController` and `registerModule` take the same options as `@Controller` and `@Module`.

## What a handler returns

What a handler may return depends on the declaration.

| Declaration                             | Return                                                    | Status        |
| --------------------------------------- | --------------------------------------------------------- | ------------- |
| `responseSchema`                        | the body                                                  | 200           |
| `responses: { 201: schema, 204: null }` | `reply(201, body)` or `reply(204)`                        | the one given |
| `errorSchema: { 404: schema }`          | additionally `reply(404, body)`                           | the one given |
| `response: 'void'`                      | nothing                                                   | 204           |
| `response: 'text'`                      | a string, a `ReadableStream` or an async iterable         | 200           |
| `response: 'blob'`                      | a `Blob`, `ArrayBuffer`, `Uint8Array` or `ReadableStream` | 200           |
| `response: 'stream'`                    | a `ReadableStream`, an async iterable or `sseStream(...)` | 200           |

### `reply()` and declared statuses

`reply(status, body)` answers with a specific status. The status must be declared in the endpoint's `responses` or `errorSchema`.

```ts
@Endpoint(createUser)
async createUser({ data }: HandlerParams<typeof createUser>) {
  return reply(201, await this.users.create(data.name))
}
```

- An endpoint declared with `responses` must return `reply()`. Returning a bare value is a compile error and, at run time, a 500.
- A status mapped to `null` in `responses` has no body: `reply(204)`.
- `reply()` with a status the endpoint does not declare is a compile error and, at run time, a 500 whose log message lists the declared statuses.

### Declared error bodies

`errorSchema` lists the error statuses an endpoint can answer with and the body of each. There are two ways to send one.

```ts
// Type-checked: the body must match the 404 schema.
return reply(404, { message: 'User not found' })

// Not type-checked: the exception's `response` is sent as the body.
throw new HttpException(404, { message: 'User not found' })
```

A thrown `HttpException` whose status is not in `errorSchema` becomes an `application/problem+json` response. See [Errors](./errors.md).

### Response validation

A JSON body is validated against the schema for its status before it is sent. This strips fields the schema does not declare, which keeps internal fields from leaking. A body that does not match its schema is a 500, and the error is logged.

The `validateResponses` application option controls this: `'always'` (default), `'development'` (skipped when `NODE_ENV` is `production`) or `'never'`. `text`, `blob` and `stream` responses are not validated at run time.

## Request validation

Core validates, in this order: URL parameters (when the declaration has `urlParamsSchema`), the query, then the body. The body is read from the connection only after guards have passed and the earlier parts are valid.

A failure is a 400 `application/problem+json` response:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed for body",
  "source": "body",
  "errors": [{ "path": "name", "message": "Too small: expected string to have >=1 characters" }]
}
```

`source` is one of `urlParams`, `query`, `headers`, `cookies` or `body`. Each entry of `errors` is one issue reported by the schema library, with its path joined by dots and its message unchanged. A malformed JSON body is reported the same way, with `source: 'body'`.

Core also validates `headersSchema` and `cookiesSchema` when a declaration object carries them, and passes the results as `headers` and `cookies` in the first argument. `@navios/builder` does not accept these two options yet, so they are not usable with `declareEndpoint` and the handler types do not include them.

## Text, binary and streamed responses

```ts
export const exportCsv = api.declareEndpoint({ method: 'GET', url: '/export', response: 'text' })
export const download = api.declareEndpoint({ method: 'GET', url: '/files/$id', response: 'blob' })
export const ticks = api.declareEndpoint({ method: 'GET', url: '/ticks', response: 'stream' })

@Controller()
export class FilesController {
  private readonly files = inject(FilesService)

  @Endpoint(exportCsv)
  exportCsv(_params: HandlerParams<typeof exportCsv>, ctx: RequestContext) {
    ctx.reply.header('content-type', 'text/csv')
    return 'id,name\n1,Ann\n'
  }

  @Endpoint(download)
  async download({ urlParams }: HandlerParams<typeof download>, ctx: RequestContext) {
    const file = await this.files.find(urlParams.id)
    if (!file) {
      throw new NotFoundException('File not found')
    }
    ctx.reply.header('content-type', file.mimeType)
    ctx.reply.header('content-disposition', `attachment; filename="${file.name}"`)
    return file.content // ArrayBuffer
  }

  @Endpoint(ticks)
  async *ticks() {
    yield 'tick 1\n'
    yield 'tick 2\n'
  }
}
```

- The default content type is `text/plain; charset=utf-8` for `text` and `application/octet-stream` for `blob` and `stream`. Set another with `ctx.reply.header('content-type', ...)`.
- An async iterable yields strings or `Uint8Array` chunks.
- The handler never receives the native reply object for streaming. The same code runs on every adapter.
- A handler may be a generator method (`async *ticks()`), as above. `this` is the controller.

## Multipart bodies

Declare the endpoint with `body: 'multipart'`. Text fields arrive as strings and files as `File` objects.

```ts
export const upload = api.declareEndpoint({
  method: 'POST',
  url: '/files',
  body: 'multipart',
  requestSchema: z.object({
    title: z.string(),
    file: z.instanceof(File),
    tags: z.array(z.string()).optional(),
  }),
  responseSchema: z.object({ name: z.string(), size: z.number() }),
})

@Controller()
export class UploadController {
  @Endpoint(upload)
  async upload({ data }: HandlerParams<typeof upload>) {
    return {
      name: data.file.name,
      size: (await data.file.arrayBuffer()).byteLength,
    }
  }
}
```

How the parts become the object that `requestSchema` validates:

- When the schema can describe itself as JSON Schema (the Standard JSON Schema extension, `~standard.jsonSchema`), a field declared as an array is always an array, even with one part, and a field declared as an object or an array of objects is parsed as JSON.
- Otherwise, a repeated field becomes an array and a value that starts with `{` or `[` is parsed as JSON when possible.
- Every other text field stays a string. Use a coercing schema (`z.coerce.number()`) for numbers.

Limitations: both adapters read every file into memory before the handler runs, so set a size limit in the adapter options for endpoints that accept uploads. The Fastify adapter needs `multipart: true`; see the adapter READMEs.

## Server-sent events

A `response: 'stream'` endpoint may return `sseStream(source)`, where `source` is an async iterable of events. Core writes the `text/event-stream` framing and sets `cache-control: no-cache`.

```ts
import { Controller, Endpoint, inject, sse, sseStream } from '@navios/core'

import type { HandlerParams, RequestContext } from '@navios/core'

const userJoined = {
  config: { eventName: 'user-joined', payloadSchema: z.object({ userId: z.string() }) },
} as const

export const feed = api.declareEndpoint({ method: 'GET', url: '/feed', response: 'stream' })

@Controller()
export class FeedController {
  private readonly joins = inject(JoinsService)

  @Endpoint(feed)
  feed(_params: HandlerParams<typeof feed>, ctx: RequestContext) {
    return sseStream(this.events(ctx.signal))
  }

  private async *events(signal: AbortSignal) {
    for await (const user of this.joins.subscribe(signal)) {
      yield sse(userJoined, { userId: user.id })
    }
  }
}
```

- `sse(event, payload, { id?, retry? })` creates an event for a declared event type. `event` is anything with `config: { eventName, payloadSchema? }`, which is the shape of an event defined with `defineEvent` from `@navios/builder/eventsource`. The payload is typed from `payloadSchema` and validated against it.
- An event can also be written by hand: `yield { event: 'tick', data: { n: 1 }, id: '7', retry: 500 }`. `data` is sent as JSON unless it is a string. Without `event`, the browser receives the default `message` event.
- Iteration stops when the client disconnects. Pass `ctx.signal` to whatever produces the events so that it stops too.

Limitations: `payloadSchema` must validate synchronously. A payload that fails validation throws inside the generator; by then the status line has been sent, so the stream ends with an error instead of a 4xx or 5xx response.

## Route rules checked at `init()`

- Two handlers that serve the same method and path fail with a message naming both, for example `GET /ping is served by both First.ping and Second.alsoPing`. Paths that differ only in parameter names count as the same path.
- A method can serve one endpoint.
- `app.routes()` returns every route after `init()`: `method`, `path`, `endpoint` (the declaration's `config`), `module`, `controller`, `handlerName`, `guards`, `interceptors` and `attributes`. `ctx.route` is the same object for the route being handled.
