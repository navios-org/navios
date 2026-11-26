---
title: srvx
---

# srvx

`@navios/adapter-srvx` runs a Navios application on [srvx](https://srvx.h3.dev), a server for the web platform's `Request` and `Response` that runs on Node.js, Deno and Bun, and that gives a `fetch` handler to runtimes that call the application themselves, such as Cloudflare Workers. The adapter finds the route of each `Request`, turns it into the input of a compiled route and builds a `Response` from the result. Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter.

Use it for an application that has to run on more than one runtime, or on one that has no adapter of its own. On Node.js alone [Fastify](/docs/server/adapters/fastify) has more options, and on Bun alone the [Bun adapter](/docs/server/adapters/bun) uses Bun's router and has WebSockets.

:::warning
On Bun, prefer `@navios/adapter-bun`. It registers the routes with the router of `Bun.serve` and writes streams to the connection directly, which this adapter cannot do through srvx, so it is the faster of the two. This adapter logs a warning when it listens on Bun. Use it there only for an application that has to run on other runtimes as well.
:::

## Install and use

```bash
npm install @navios/adapter-srvx@next srvx
```

srvx is a peer dependency, so the application chooses its version.

```ts title="main.mts"
import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineSrvxEnvironment({
    cors: {
      origin: ['https://app.example.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  }),
})

const url = await app.listen({ port: 3000, hostname: '0.0.0.0' })
```

`app.listen({ port?, hostname? })` resolves to the server's base URL. What is left out is decided by srvx: the port is the `PORT` environment variable or 3000, and the hostname the `HOST` environment variable or every interface. Pass `port: 0` for an ephemeral port.

In tests, `app.inject()` builds a `Request` and runs it through the same routing and CORS handling without opening a socket. See [Testing](/docs/server/essentials/testing).

## Runtimes that call `fetch`

`app.getServer()` returns the srvx server. Before `listen()` it is one that does not listen, and its `fetch` handles a request. That is the whole application for a runtime that has no port to listen on.

```ts title="worker.mts"
import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { NaviosFactory } from '@navios/server'

import type { CloudflareFetchHandler, Server } from 'srvx'

import { AppModule } from './app.module.mjs'

async function start(): Promise<CloudflareFetchHandler> {
  const app = await NaviosFactory.create(AppModule, { adapter: defineSrvxEnvironment() })
  await app.init()
  return (app.getServer() as unknown as Server<CloudflareFetchHandler>).fetch
}

let handler: Promise<CloudflareFetchHandler> | undefined

export default {
  async fetch(request, env, context) {
    handler ??= start()
    return (await handler)(request, env, context)
  },
} satisfies { fetch: CloudflareFetchHandler }
```

- The bundler resolves `srvx` to its build for the runtime: `workerd` for Cloudflare Workers, and a generic one elsewhere. The types of `srvx` are those of every runtime, so the handler is named here.
- The bindings and the execution context are in `ctx.raw.request.runtime.cloudflare`, and `ctx.raw.request.waitUntil()` keeps the Worker alive for work that outlives the response.
- `@navios/server` imports `node:async_hooks`, `node:util`, `node:os` and `node:process`. On Cloudflare Workers that needs the `nodejs_compat` compatibility flag.
- A Worker is built before it is deployed, and the build has to compile standard decorators, as esbuild does.

`listen()` creates a second server, the one that listens, and `app.getServer()` returns that one from then on. Do not keep the first.

:::info
The adapter's tests run on Node.js and on Bun, and against srvx's Cloudflare build under Node.js. They do not run inside `workerd` or Deno.
:::

## Options

Both options of `defineSrvxEnvironment(options)` are optional.

| Option  | Type                         | Meaning                                                                                                                                                                                           |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cors`  | `SrvxCorsOptions`            | Enables CORS. See [CORS](#cors).                                                                                                                                                                  |
| `serve` | options of `serve()` of srvx | Extra options for srvx, for example `tls`, `maxRequestBodySize`, `trustProxy`, `middleware`, `plugins`, `node`, `bun` or `deno`. `fetch`, `port`, `hostname` and `manual` are set by the adapter. |

```ts
defineSrvxEnvironment({
  serve: {
    maxRequestBodySize: 10 * 1024 * 1024,
    trustProxy: 'loopback',
  },
})
```

Two options of srvx have another default here:

- `silent` is `true`. srvx prints the address it listens on otherwise; `app.listen()` resolves to it.
- `gracefulShutdown` is `false`. srvx would close its server on `SIGINT` and `SIGTERM` without closing the application. Use [`app.enableShutdownHooks()`](/docs/server/essentials/application).

An error that reaches srvx, which is one of a `middleware`, is logged and answered with a 500 problem response. `serve.error` replaces that.

## The `Register` declaration

```ts
import type { SrvxEnvironment } from '@navios/adapter-srvx'

declare module '@navios/server' {
  interface Register {
    environment: SrvxEnvironment
  }
}
```

Write this once in the application, usually next to `NaviosFactory.create`. It types `ctx.raw`, `app.getServer()` and the options of `app.listen()` for srvx. [Request context](/docs/server/essentials/request-context) explains the mechanism and what happens without the declaration.

## What `ctx.raw` contains

| Member            | Type                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| `ctx.raw.request` | the `ServerRequest` of srvx: a web `Request` with `runtime`, `ip` and `waitUntil` |
| `ctx.raw.server`  | the srvx `Server`, or `null`                                                      |

`ctx.raw.server` is `null` for requests handled through `app.inject()` before there is a server.

What belongs to one runtime is in `ctx.raw.request.runtime`:

| Runtime            | `ctx.raw.request.runtime`                             |
| ------------------ | ----------------------------------------------------- |
| Node.js            | `node.req` and `node.res`, the objects of `node:http` |
| Bun                | `bun.server`, the server of `Bun.serve`               |
| Deno               | `deno.info`, with the address of the connection       |
| Cloudflare Workers | `cloudflare.env` and `cloudflare.context`             |

srvx has no request id, so `ctx.id` is generated by `@navios/server` on first read. `ctx.signal` is the request's own `signal`. `ctx.ip` is `request.ip`: the address of the connection, the client's address behind the proxies that `serve.trustProxy` trusts, and on Cloudflare the `cf-connecting-ip` header.

Code that uses `ctx.raw` runs on this adapter only, and what is in `runtime` on one runtime only. Prefer the adapter-neutral members of the context (`ctx.ip`, `ctx.headers`, `ctx.cookies`, `ctx.reply.header()`, `ctx.signal`) where they cover the need.

## Taking over the response

A handler cannot write the response itself. It returns a value, and for streaming it returns a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`. See [Streams and server-sent events](/docs/server/guides/streams-and-sse). The adapter does not know of a response that is written to `runtime.node.res`, and has no WebSockets.

## Idle connections

On Bun, a connection on which nothing has been sent for `serve.bun.idleTimeout`, 10 seconds by default, is closed, also while a handler is running. The adapter turns that off for an event stream (`sseStream()`, or another stream with the content type `text/event-stream`) until the stream has ended. Raise the timeout for other streams that are quiet for longer.

## CORS

CORS is implemented by the adapter and applied once per response, including error and not-found responses. A preflight request (`OPTIONS` with `Origin` and `Access-Control-Request-Method`) is answered with 204, also on a path with an `OPTIONS` route.

The options are those of the Bun adapter, and behave the same: `origin`, `credentials`, `methods`, `allowedHeaders`, `exposedHeaders`, `maxAge` and `cacheControl`. [CORS on Bun](/docs/server/adapters/bun#cors) describes them, the function that `origin` may be, and why `origin: '*'` with `credentials: true` throws.

## Multipart

Multipart needs no option. An endpoint declared with `body: 'multipart'` receives text fields as strings and files as `File` objects, validated by the endpoint's `requestSchema`. [File uploads](/docs/server/guides/file-uploads) covers the handler side.

The body is parsed with `request.formData()`, which reads the whole body into memory. Limit the size with `serve.maxRequestBodySize`; the limit applies to the whole multipart body, not to each file.

## Request bodies

- The body is read only when the pipeline asks for it, which is after guards have passed, and then [decoded by its content type](/docs/server/essentials/controllers#request-bodies).
- A body can be read once. A handler that reads `ctx.raw.request` itself belongs to an endpoint without a `requestSchema`; next to one, use [`ctx.rawBody()`](/docs/server/essentials/request-context#the-raw-body).

### Body size limit

`serve.maxRequestBodySize` limits the size of a request body, whatever its content type. A larger body is answered with a 413 problem response. There is no limit when it is not set, as in srvx. A body is held in memory, so set one.

The adapter enforces the limit itself, the same way on every runtime, and starts srvx without one. On Bun it raises the limit of `Bun.serve` as well, which would answer with an empty 413; without `serve.maxRequestBodySize` that limit of Bun stays at its 128 MiB. When the limit applies depends on whether the request declares its length:

| Request                                                   | When it is rejected                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `content-length` over the limit                           | Before guards run, on any route, including one that reads no body and a path that matches no route.                               |
| No `content-length` (chunked transfer encoding)           | When the pipeline asks for the body, which is after guards. The body is counted while it is read, and reading stops at the limit. |
| No `content-length`, on a route that never reads the body | Never.                                                                                                                            |

## Routing

srvx has no router. Routes are matched by the router of `@navios/server`, which is also what `app.inject()` uses on every adapter:

- Fixed text wins over a URL parameter at the first segment where two routes differ, and the order of the controllers does not matter.
- A segment is compared decoded, so `/%75sers` is `/users`.
- A path that is not valid percent-encoding is a 400.
- Every method that the runtime accepts can be declared.

On Node.js, a request without a `Host` header, or with one that is not a host, has `localhost` as the host of `ctx.url`, as on the other adapters. `ctx.raw.request.url` has what srvx puts there: the address of the server, or `_invalid_`.

## Shutdown

`app.close()` stops accepting connections and waits for requests in flight, streams included, for at most the application's `shutdownTimeout` (10 seconds by default). Then it closes the connections that are left, and the application continues with its shutdown hooks. A connection on which no request was sent is not waited for, and on Node.js a response that is sent while the server closes carries `connection: close`. [Application setup](/docs/server/essentials/application) describes the whole shutdown sequence.

An application that never listened waits for the requests of `fetch` and `app.inject()` that are in flight.

## Requirements

- srvx 1.0 or newer (peer dependency)
- Node.js 24 or newer, Bun 1.4.5 or newer, or another runtime that srvx supports
- `@navios/server` of the same version (peer dependency), with `@navios/builder`
