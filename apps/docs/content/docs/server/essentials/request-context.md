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
  ctx.ip // '203.0.113.7'
  ctx.headers.get('accept-language')
  ctx.cookies.get('sid')
  // ...
}
```

Most members are created on first access, so a request that never reads cookies or the query string pays nothing for them.

## Request data

| Member                       | Type                               | Notes                                                                                                                                                                               |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.id`                     | `string`                           | The adapter's request id when it has one (Fastify), otherwise a process-unique `req-N`                                                                                              |
| `ctx.method`                 | `string`                           |                                                                                                                                                                                     |
| `ctx.path`                   | `string`                           | The path that was matched, without the query string. See [Path, URL and address](#path-url-and-address)                                                                             |
| `ctx.url`                    | `URL`                              | The URL of the request, with `ctx.path` as its path                                                                                                                                 |
| `ctx.ip`                     | `string \| undefined`              | The address of the client                                                                                                                                                           |
| `ctx.route`                  | `RouteInfo`                        | The matched route: method, full path, the endpoint's `config`, controller, guards, attributes                                                                                       |
| `ctx.handler`                | `RouteInfo`                        | The same object as `ctx.route`, under the name every transport's context has                                                                                                        |
| `ctx.kind`                   | `'http'`                           | The kind of transport. A guard shared with [other transports](/docs/server/guides/other-transports#guards-and-interceptors-on-several-transports) narrows with `isHttpContext(ctx)` |
| `ctx.urlParams`              | `Readonly<Record<string, string>>` | Decoded URL parameters of the whole path, module and global prefixes included. Not validated                                                                                        |
| `ctx.query`                  | `RequestQuery`                     | The parsed query string; a repeated parameter is an array. Not validated                                                                                                            |
| `ctx.headers.get(name)`      | `string \| undefined`              | Case-insensitive                                                                                                                                                                    |
| `ctx.headers.toWebHeaders()` | `Headers`                          | All request headers as a web `Headers` object, for libraries that take one                                                                                                          |
| `ctx.cookies.get(name)`      | `string \| undefined`              | Parsed from the `cookie` header on first use. Values are URL-decoded                                                                                                                |
| `ctx.cookies.all()`          | `Readonly<Record<string, string>>` |                                                                                                                                                                                     |
| `ctx.signal`                 | `AbortSignal`                      | Aborts when the client disconnects                                                                                                                                                  |

`ctx.urlParams` and `ctx.query` hold what the client sent, as strings. They are what a guard reads, because guards run [before validation](/docs/server/request-lifecycle). In a handler, use the validated values in the first argument instead. The decoded body is not on the context: it is not read until guards have passed. Its bytes are, as [`ctx.rawBody()`](#the-raw-body).

### Path, URL and address

`ctx.path` is made of the route and the URL parameters, so it is the path that was matched whatever the request target looked like: `/%61dmin`, `http://any.host/admin` and a request with an invalid `Host` header all have the path `/admin`, on every adapter. A guard may compare it. Comparing `ctx.route.path`, the declared path, is simpler still when parameters do not matter.

`ctx.url.host` is what the client says in its `Host` header, or `localhost` when that is not a valid host. Do not build links that you send to somebody else from it.

`ctx.ip` is the address of the connection. Behind a proxy that is the proxy's address, unless the adapter is told which proxies to trust: set `trustProxy` on [Fastify](/docs/server/adapters/fastify), or `serve.trustProxy` on [srvx](/docs/server/adapters/srvx); Bun has no such option, so read the header your proxy sets. It is `undefined` for `app.inject()` without a `remoteAddress`.

### The request for `fetch` handlers

`await ctx.toWebRequest()` is the request as a Web `Request`, for code written for `fetch` handlers. On Bun, and srvx on Bun and Deno, it is the request the server received, untouched, as long as nothing has read its body. Otherwise, on Fastify, srvx on Node, or once a guard has read `ctx.rawBody()`, it is built from the method, the target as the client sent it, the headers but those of the connection (`connection`, `transfer-encoding` and the like), and the bytes of the body. Its body can be read once. A handler can return what such code answers; see [What a handler returns](/docs/server/essentials/controllers#what-a-handler-returns).

### The raw body

`await ctx.rawBody()` gives the bytes of the request body exactly as they were sent. Use it where the bytes matter, such as the signature of a webhook:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

import { Injectable } from '@navios/server'

import type { Guard, RequestContext } from '@navios/server'

@Injectable()
export class WebhookGuard implements Guard {
  private readonly secret = process.env.WEBHOOK_SECRET!

  async canActivate(ctx: RequestContext) {
    const sent = Buffer.from(ctx.headers.get('x-signature') ?? '', 'hex')
    const expected = createHmac('sha256', this.secret)
      .update(await ctx.rawBody())
      .digest()
    return sent.byteLength === expected.byteLength && timingSafeEqual(sent, expected)
  }
}
```

Reading the bytes does not keep the body from being decoded: with this guard on it, the handler gets `data` as usual. The body is read from the connection once, and the adapter's limit holds: a body over it is a 413.

It works for any content type, also on an endpoint without a `requestSchema`, and before or after the body is decoded. The one exception is a multipart body, which is not kept in one piece: read its bytes before it is decoded, in a guard.

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

- `header(name, value)`: names are lower-cased, and setting a name twice keeps the last value. A value is a string or a number. A list of values is sent as one header line per value.
- `append(name, value)`: adds a value next to those the header has. Use it to forward several `set-cookie` or `link` headers of another response.
- `cookie(name, value, options?)`: adds a `Set-Cookie` header, in place of an earlier one with the same name, domain and path. The value is URL-encoded. Options are `domain`, `path` (defaults to `/`), `expires`, `maxAge` (seconds), `httpOnly`, `secure`, `sameSite` (`'strict'`, `'lax'` or `'none'`) and `partitioned`.
- `deleteCookie(name, { domain, path })`: makes the browser delete a cookie. Pass the domain and path it was set with.
- Names and values are checked when they are set: a line break in a header, a `;` in a cookie's path, `sameSite: 'none'` without `secure`, or a `__Host-` cookie with a domain throws there, in your code.
- Headers and cookies set this way are sent on error responses too, except those that describe the response that failed: `content-type`, `content-encoding`, `content-disposition` and the like, `etag`, `last-modified`, `expires`, a `content-range` other than `bytes */<size>`, and a `cache-control` that lets a cache keep the response. One that only restricts stays: `no-store`, `no-cache`, `max-age=0`, or `private` without a lifetime. A header that an error response sets itself wins.

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

Callbacks run in reverse registration order, after a streamed body has been closed and before per-request state is disposed. A callback may register another one. One registered after the response has finished runs at once. What a callback throws is logged. `ctx.responseStatus` is `undefined` until the response is known.

When `app.close()` has to give up on a request, its callbacks run and its state is disposed before the application's own services are.

## Per-request state

`ctx.get`, `ctx.find`, `ctx.set` and `ctx.has` read and write typed per-request slots, and `ctx.use` and `ctx.resolve` reach request-scoped services. Both are described in [Per-request state](/docs/server/guides/request-state).

## Native objects

`ctx.raw` holds the adapter's own request objects.

| Adapter           | `ctx.raw`                                            |
| ----------------- | ---------------------------------------------------- |
| Fastify           | `{ request: FastifyRequest; reply: FastifyReply }`   |
| Bun               | `{ request: Request; server: Server \| null }`       |
| srvx              | `{ request: ServerRequest; server: Server \| null }` |
| In-memory (tests) | `{ request: TestRequest }`                           |

Without further setup `ctx.raw` is `unknown`. Its type comes from one declaration in the application, which tells TypeScript which adapter the application runs on:

```ts title="main.mts"
import type { FastifyEnvironment } from '@navios/adapter-fastify'

declare module '@navios/server' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

On Bun the type is `BunEnvironment` from `@navios/adapter-bun`, and on srvx `SrvxEnvironment` from `@navios/adapter-srvx`.

- The declaration also types `app.getServer()` and the options of `app.listen()`. `NaviosApplication` without an argument is then an application on that adapter; a helper that takes an application on any adapter, such as one for tests, takes `NaviosApplication<any>`.
- An adapter does not register itself when imported, because a shared package may have several adapters installed. The application decides.
- Code that must compile without the declaration, such as a library used on several adapters, narrows explicitly: `const { request } = ctx.raw as FastifyEnvironment['raw']`.

Code that uses `ctx.raw` runs on one adapter only. Prefer the adapter-neutral members when they cover the need. What each adapter exposes is described on the [Fastify](/docs/server/adapters/fastify), [Bun](/docs/server/adapters/bun) and [srvx](/docs/server/adapters/srvx) pages.

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

It is the request in everything that runs for it: guards, interceptors, the handler, the body of a stream, error mappers, `onFinish` callbacks and `dispose` hooks. `currentContext()` returns `undefined` outside a request, and always when the application was created without `asyncContext: true`.
