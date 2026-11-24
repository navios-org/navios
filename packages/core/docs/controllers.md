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

## The field form: `handler()`

```ts
import { Controller, handler, inject, reply } from '@navios/core'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, ({ urlParams }, ctx) => {
    return this.users.find(urlParams.id) ?? reply(404, { message: 'User not found' })
  })

  listUsers = handler(listUsers, ({ params }) => this.users.list(params.limit))

  createUser = handler(createUser, async ({ data }) => reply(201, this.users.create(data.name)))
}
```

- The first argument is typed from the declaration: `urlParams` (path parameters), `params` (the validated query) and `data` (the validated body). A key is present only when the declaration has the matching part.
- The second argument is the `RequestContext`.
- The return type is checked against the declaration. Returning a value of the wrong shape, or `reply()` with a status the endpoint does not declare, is a compile error.
- `this` inside the arrow function is the controller, so `inject()` fields work.
- The route's `handlerName` is the property name.

Guards, interceptors and attributes for one handler go in an options object between the endpoint and the function:

```ts
admin = handler(
  adminOnly,
  { guards: [RolesGuard], interceptors: [AuditInterceptor], attributes: [Roles(['admin'])] },
  (_params, ctx) => ({ name: ctx.get(CurrentUser).name }),
)
```

Attribute, `@UseGuards` and `@UseInterceptors` decorators also work on a handler field:

```ts
@Public()
ping = handler(ping, () => ({ ok: true }))
```

## The method form: `@Endpoint`

```ts
import { Controller, Endpoint, inject } from '@navios/core'

import type { HandlerParams, HandlerResult, RequestContext } from '@navios/core'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(listUsers)
  async listUsers({ params }: HandlerParams<typeof listUsers>, ctx: RequestContext) {
    return this.users.list(params.limit)
  }

  @Endpoint(getUser)
  async getUser(params: HandlerParams<typeof getUser>): HandlerResult<typeof getUser> {
    return this.users.find(params.urlParams.id) ?? reply(404, { message: 'User not found' })
  }
}
```

TypeScript does not infer a method's parameter types from a decorator, so the parameter is annotated with `HandlerParams<typeof endpoint>`. The decorator still checks the method's signature and return type against the declaration. `HandlerResult<typeof endpoint>` is available when you want to annotate the return type. A method that needs no arguments may declare none.

Both forms produce the same route. Use the field form unless you have a reason to prefer methods.

A method that has `@UseGuards`, `@UseInterceptors` or an attribute but no `@Endpoint` fails at `init()`.

## Controller options

```ts
@Controller({ guards: [AuthGuard], interceptors: [TimingInterceptor] })
export class AccountController {}
```

`@UseGuards(...)` and `@UseInterceptors(...)` on the class do the same. Place them above `@Controller`.

A controller has no path of its own. Path prefixes belong to [modules](./modules.md).

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
createUser = handler(createUser, ({ data }) => reply(201, this.users.create(data.name)))
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

  exportCsv = handler(exportCsv, (_params, ctx) => {
    ctx.reply.header('content-type', 'text/csv')
    return 'id,name\n1,Ann\n'
  })

  download = handler(download, async ({ urlParams }, ctx) => {
    const file = await this.files.find(urlParams.id)
    if (!file) {
      throw new NotFoundException('File not found')
    }
    ctx.reply.header('content-type', file.mimeType)
    ctx.reply.header('content-disposition', `attachment; filename="${file.name}"`)
    return file.content // ArrayBuffer
  })

  ticks = handler(ticks, async function* () {
    yield 'tick 1\n'
    yield 'tick 2\n'
  })
}
```

- The default content type is `text/plain; charset=utf-8` for `text` and `application/octet-stream` for `blob` and `stream`. Set another with `ctx.reply.header('content-type', ...)`.
- An async iterable yields strings or `Uint8Array` chunks.
- The handler never receives the native reply object for streaming. The same code runs on every adapter.
- An `async function*` passed to `handler()` has no `this`. To use controller fields in a generator, return one from an arrow function: `handler(ticks, () => this.generate())`.

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
  upload = handler(upload, async ({ data }) => ({
    name: data.file.name,
    size: (await data.file.arrayBuffer()).byteLength,
  }))
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
import { Controller, handler, sse, sseStream } from '@navios/core'

const userJoined = {
  config: { eventName: 'user-joined', payloadSchema: z.object({ userId: z.string() }) },
} as const

export const feed = api.declareEndpoint({ method: 'GET', url: '/feed', response: 'stream' })

@Controller()
export class FeedController {
  private readonly joins = inject(JoinsService)

  feed = handler(feed, (_params, ctx) => sseStream(this.events(ctx.signal)))

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
