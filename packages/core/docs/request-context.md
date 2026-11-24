# Request context

`RequestContext` is one object per request. Guards and interceptors receive it as their first argument, handlers as their second. Everything on it is the same on every adapter except `raw`.

```ts
import type { RequestContext } from '@navios/core'

getUser = handler(getUser, ({ urlParams }, ctx: RequestContext) => {
  ctx.id // request id
  ctx.method // 'GET'
  ctx.path // '/users/1', without the query string
  ctx.route // the RouteInfo of the matched route
  // ...
})
```

Most members are created on first access, so a request that does not read cookies or headers pays nothing for them.

## Request data

| Member                       | Type                               | Notes                                                                                                            |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ctx.id`                     | `string`                           | The adapter's request id when it has one (Fastify), otherwise a process-unique `req-N` generated on first read.  |
| `ctx.method`                 | `string`                           |                                                                                                                  |
| `ctx.path`                   | `string`                           | Without the query string.                                                                                        |
| `ctx.route`                  | `RouteInfo`                        | Method, full path, the endpoint's `config`, module, controller, `handlerName`, guards, interceptors, attributes. |
| `ctx.urlParams`              | `Readonly<Record<string, string>>` | Decoded URL parameters of the whole path, module and global prefixes included. Not validated.                    |
| `ctx.query`                  | `RequestQuery`                     | The parsed query string; a repeated parameter is an array. Not validated. Parsed on first read.                  |
| `ctx.headers.get(name)`      | `string \| undefined`              | Case-insensitive.                                                                                                |
| `ctx.headers.toWebHeaders()` | `Headers`                          | All request headers as a web `Headers` object, built on first call. Useful for auth libraries that take one.     |
| `ctx.cookies.get(name)`      | `string \| undefined`              | Parsed from the `cookie` header on first use. Values are URL-decoded.                                            |
| `ctx.cookies.all()`          | `Readonly<Record<string, string>>` |                                                                                                                  |
| `ctx.signal`                 | `AbortSignal`                      | Aborts when the client disconnects.                                                                              |

`ctx.urlParams` and `ctx.query` are what the client sent, as strings. Guards run before validation, so these are what a guard reads. The validated URL parameters, query and body are the handler's first argument; the body is not on the context at all, because it is not read until guards have passed.

### The abort signal

Pass `ctx.signal` to work that should stop when the client goes away:

```ts
report = handler(report, async (_params, ctx) => {
  const rows = await this.db.query(sql, { signal: ctx.signal })
  return { rows }
})
```

## Reply controls

`ctx.reply` sets response headers and cookies from a guard, an interceptor or a handler.

```ts
ctx.reply.header('cache-control', 'no-store')
ctx.reply.cookie('sid', sessionId, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600 })
```

- `header(name, value)`: header names are lower-cased, and setting a name twice keeps the last value.
- `cookie(name, value, options?)`: adds a `Set-Cookie`. The value is URL-encoded. Options are `domain`, `path` (defaults to `/`), `expires`, `maxAge` (seconds), `httpOnly`, `secure` and `sameSite` (`'strict' | 'lax' | 'none'`).
- Headers and cookies set this way are also sent on error responses for the request. A header that an error response sets itself, such as the `content-type` of a problem response, wins over one set through `ctx.reply`.

There is no `ctx.reply.status()`. The status comes from the declaration: return `reply(status, body)` for a declared status, or throw an `HttpException`.

## When the response has finished

`ctx.onFinish(callback)` runs a callback once the response is done: after the body has been sent, a stream has ended, or the client has gone away. `ctx.responseStatus` holds the final status by then, including the status an error was mapped to. An interceptor uses the pair to end a span or record a duration:

```ts
@Injectable()
export class TimingInterceptor implements Interceptor {
  intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    const started = performance.now()
    ctx.onFinish(() => {
      metrics.record(ctx.route.path, ctx.responseStatus, performance.now() - started)
    })
    return next()
  }
}
```

Callbacks run in reverse registration order, before request values and the DI scope are disposed. A callback registered after the response has finished runs at once. `ctx.responseStatus` is `undefined` until the response is known.

## Per-request state

`ctx.get`, `ctx.find`, `ctx.set` and `ctx.has` read and write typed per-request slots. `ctx.use` and `ctx.resolve` reach request-scoped services. Both are described in [Per-request state](./request-state.md).

## Native objects: `ctx.raw`

`ctx.raw` holds the adapter's own request objects.

| Adapter           | `ctx.raw`                                          |
| ----------------- | -------------------------------------------------- |
| Fastify           | `{ request: FastifyRequest; reply: FastifyReply }` |
| Bun               | `{ request: Request; server: Server \| null }`     |
| In-memory (tests) | `{ request: TestRequest }`                         |

Its type comes from one declaration in the application:

```ts
import type { FastifyEnvironment } from '@navios/adapter-fastify'

declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

- Without the declaration `ctx.raw` is `unknown`.
- The declaration also types `app.getServer()` and the options of `app.listen()`.
- An adapter does not register itself when imported, because a shared package may have both adapters installed. The application decides.
- Code that must compile without the declaration, such as a library used on several adapters, narrows explicitly: `const { request } = ctx.raw as FastifyEnvironment['raw']`.

Code that uses `ctx.raw` runs on one adapter only. Prefer the adapter-neutral members when they cover the need.

## `currentContext()`

Code that cannot receive the context as an argument, such as a logger or a repository several calls deep, can read it from an `AsyncLocalStorage`. This is off by default because it costs time on every request.

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  asyncContext: true,
})
```

```ts
import { currentContext, Injectable } from '@navios/core'

@Injectable()
export class AuditLog {
  write(action: string) {
    const ctx = currentContext()
    console.log(ctx?.id, ctx?.path, action)
  }
}
```

`currentContext()` returns `undefined` outside a request, and always when the application was created without `asyncContext: true`.
