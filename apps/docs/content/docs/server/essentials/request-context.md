---
title: Request context
---

# Request context

`RequestContext` is one object per request. Handlers receive it as their second argument, guards and interceptors as their first. Everything on it is the same on every adapter except `raw`.

```ts
import type { HandlerParams, RequestContext } from '@navios/server'

// getUser comes from the Quick start
@Endpoint(getUser)
async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
  ctx.id // request id
  ctx.method // 'GET'
  ctx.path // '/users/42', without the query string
  ctx.headers.get('accept-language')
  ctx.cookies.get('sid')
  // ...
}
```

Most members are created on first access, so a request that never reads cookies or the query string pays nothing for them.

## Request data

| Member                       | Type                               | Notes                                                                                             |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ctx.id`                     | `string`                           | The adapter's request id when it has one (Fastify), otherwise a process-unique `req-N`            |
| `ctx.method`                 | `string`                           |                                                                                                   |
| `ctx.path`                   | `string`                           | Without the query string                                                                          |
| `ctx.route`                  | `RouteInfo`                        | The matched route: method, full path, the endpoint's `config`, controller, guards, attributes     |
| `ctx.urlParams`              | `Readonly<Record<string, string>>` | Decoded URL parameters of the whole path, module and global prefixes included. Not validated      |
| `ctx.query`                  | `RequestQuery`                     | The parsed query string; a repeated parameter is an array. Not validated                          |
| `ctx.headers.get(name)`      | `string \| undefined`              | Case-insensitive                                                                                  |
| `ctx.headers.toWebHeaders()` | `Headers`                          | All request headers as a web `Headers` object, for libraries that take one                        |
| `ctx.cookies.get(name)`      | `string \| undefined`              | Parsed from the `cookie` header on first use. Values are URL-decoded                              |
| `ctx.cookies.all()`          | `Readonly<Record<string, string>>` |                                                                                                   |
| `ctx.signal`                 | `AbortSignal`                      | Aborts when the client disconnects                                                                |

`ctx.urlParams` and `ctx.query` hold what the client sent, as strings. They are what a guard reads, because guards run [before validation](/docs/server/request-lifecycle). In a handler, use the validated values in the first argument instead. The body is not on the context at all: it is not read until guards have passed.

### The abort signal

Pass `ctx.signal` to work that should stop when the client goes away:

```ts
@Endpoint(listUsers)
async listUsers({ params }: HandlerParams<typeof listUsers>, ctx: RequestContext) {
  return this.users.search(params.limit, { signal: ctx.signal })
}
```

## Reply controls

`ctx.reply` sets response headers and cookies from a guard, an interceptor or a handler.

```ts
ctx.reply.header('cache-control', 'no-store')
ctx.reply.cookie('sid', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 3600,
})
```

- `header(name, value)`: names are lower-cased, and setting a name twice keeps the last value.
- `cookie(name, value, options?)`: adds a `Set-Cookie` header. The value is URL-encoded. Options are `domain`, `path` (defaults to `/`), `expires`, `maxAge` (seconds), `httpOnly`, `secure` and `sameSite` (`'strict'`, `'lax'` or `'none'`).
- Headers and cookies set this way are sent on error responses too. A header that an error response sets itself, such as the `content-type` of a problem response, wins.

There is no way to set the status here. The status comes from the declaration: return `reply(status, body)` for a [declared status](/docs/server/essentials/controllers#declared-statuses), or throw an [`HttpException`](/docs/server/essentials/errors#httpexception).

## When the response has finished

`ctx.onFinish(callback)` runs a callback once the response is done: the body has been sent, a stream has ended, or the client has gone away. By then `ctx.responseStatus` holds the final status, including the status an error was mapped to. An interceptor uses the pair to write an access log or end a span:

```ts
import { Injectable } from '@navios/server'

import type { Interceptor, RequestContext, RouteResult } from '@navios/server'

@Injectable()
export class AccessLogInterceptor implements Interceptor {
  intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    const started = performance.now()
    ctx.onFinish(() => {
      const ms = (performance.now() - started).toFixed(1)
      console.log(`${ctx.method} ${ctx.path} ${ctx.responseStatus} ${ms}ms`)
    })
    return next()
  }
}
```

Callbacks run in reverse registration order, before per-request state is disposed. A callback registered after the response has finished runs at once. `ctx.responseStatus` is `undefined` until the response is known.

## Per-request state

`ctx.get`, `ctx.find`, `ctx.set` and `ctx.has` read and write typed per-request slots, and `ctx.use` and `ctx.resolve` reach request-scoped services. Both are described in [Per-request state](/docs/server/guides/request-state).

## Native objects

`ctx.raw` holds the adapter's own request objects.

| Adapter           | `ctx.raw`                                          |
| ----------------- | -------------------------------------------------- |
| Fastify           | `{ request: FastifyRequest; reply: FastifyReply }` |
| Bun               | `{ request: Request; server: Server \| null }`     |
| In-memory (tests) | `{ request: TestRequest }`                         |

Without further setup `ctx.raw` is `unknown`. Its type comes from one declaration in the application, which tells TypeScript which adapter the application runs on:

```ts title="main.mts"
import type { FastifyEnvironment } from '@navios/adapter-fastify'

declare module '@navios/server' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

On Bun the type is `BunEnvironment` from `@navios/adapter-bun`.

- The declaration also types `app.getServer()` and the options of `app.listen()`.
- An adapter does not register itself when imported, because a shared package may have both adapters installed. The application decides.
- Code that must compile without the declaration, such as a library used on several adapters, narrows explicitly: `const { request } = ctx.raw as FastifyEnvironment['raw']`.

Code that uses `ctx.raw` runs on one adapter only. Prefer the adapter-neutral members when they cover the need. What each adapter exposes is described on the [Fastify](/docs/server/adapters/fastify) and [Bun](/docs/server/adapters/bun) pages.

## Reading the context without passing it

Code that cannot receive the context as an argument, such as a logger or a repository several calls deep, can read it with `currentContext()`. This relies on an `AsyncLocalStorage`, which costs time on every request, so it is off until the application asks for it:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  asyncContext: true,
})
```

```ts
import { currentContext, Injectable } from '@navios/server'

@Injectable()
export class AuditLog {
  write(action: string) {
    const ctx = currentContext()
    console.log(ctx?.id, ctx?.path, action)
  }
}
```

`currentContext()` returns `undefined` outside a request, and always when the application was created without `asyncContext: true`.
