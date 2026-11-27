---
title: srvx
---

# srvx

`@navios/adapter-srvx` is the adapter for runtimes that the other adapters do not reach: Cloudflare Workers, AWS Lambda, Deno, and anything else that hands an application a web `Request` and takes a `Response`. [Fastify](/docs/server/adapters/fastify) needs Node.js and [`Bun.serve`](/docs/server/adapters/bun) needs Bun; this one is built on [srvx](https://srvx.h3.dev), which speaks the web platform on all of them.

The adapter finds the route of each `Request`, turns it into the input of a compiled route and builds a `Response` from the result. Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter.

## Where to use it

| Runtime            | Use                                                 | How the adapter is tested there                         |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| Cloudflare Workers | this adapter, with [`fetch`](#cloudflare-workers)   | a bundled Worker in `workerd`                           |
| AWS Lambda         | this adapter, with [`srvx/aws-lambda`](#aws-lambda) | events of API Gateway, on Node.js                       |
| Deno               | this adapter, with [`app.listen()`](#deno)          | the whole conformance suite, on `Deno.serve`            |
| Node.js            | [Fastify](/docs/server/adapters/fastify)            | the whole conformance suite; supported, not recommended |
| Bun                | [Bun](/docs/server/adapters/bun)                    | the whole conformance suite; supported, not recommended |

It runs on Node.js and on Bun, and an application that has to run there as well as on one of the others can use it everywhere. For an application that only runs on one of the two, their own adapters are the better choice:

- On Bun, `@navios/adapter-bun` registers the routes with the router of `Bun.serve` and writes streams to the connection directly. This adapter cannot do either through srvx, and logs a warning when it listens on Bun.
- On Node.js, Fastify has more options, takes over a response and has plugins. This adapter has not been measured to be faster there.

## Install and use

```bash
npm install @navios/adapter-srvx@next srvx
```

srvx is a peer dependency, so the application chooses its version.

An application is created the same way on every runtime:

```ts title="app.mts"
import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

export function createApp() {
  return NaviosFactory.create(AppModule, {
    adapter: defineSrvxEnvironment({
      cors: { origin: ['https://app.example.com'] },
      serve: { maxRequestBodySize: 1024 * 1024 },
    }),
  })
}
```

What differs is who takes the requests. Where the runtime has a port to listen on, the application listens. Where the runtime calls the application, it is initialised with `app.init()`, and `app.getServer().fetch` handles a request: before `listen()`, `app.getServer()` is a srvx server that does not listen.

In tests, `app.inject()` builds a `Request` and runs it through the same routing and CORS handling without opening a socket. It calls the adapter, not srvx: `serve.middleware`, `serve.plugins` and `serve.error` take no part in it, where the `inject()` of the Fastify adapter runs hooks and plugins. To test those, send a `Request` to `app.getServer().fetch`, which is what a runtime calls. See [Testing](/docs/server/essentials/testing).

## Cloudflare Workers

```ts title="worker.mts"
import type { CloudflareFetchHandler, Server } from 'srvx'

import { createApp } from './app.mjs'

async function start(): Promise<CloudflareFetchHandler> {
  const app = await createApp()
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

- **Set the `nodejs_compat` compatibility flag, and a compatibility date of 2024-09-23 or later.** `@navios/server` imports `node:async_hooks`, `node:util` and `node:process`, and uses the `process` global, which the flag provides from that date.
- The bundler resolves `srvx` to its build for `workerd`. The types of `srvx` are those of every runtime, so the handler is named here.
- The bindings and the execution context are in `ctx.raw.request.runtime.cloudflare`, and `ctx.raw.request.waitUntil()` keeps the Worker alive for work that outlives the response.
- `ctx.ip` is the `cf-connecting-ip` header, and `undefined` for a request without it.
- The application is created on the first request, not when the module is loaded: a Worker may do little before it is called.
- A Worker is built before it is deployed. A build that compiles standard decorators, as esbuild does, is all an application with decorators needs.

## AWS Lambda

A function of Lambda runs on Node.js, where srvx makes a `Request` of the event of API Gateway, a function URL or a load balancer, and a result of the `Response`:

```ts title="lambda.mts"
import { handleLambdaEvent } from 'srvx/aws-lambda'

import type { AWSLambdaHandler } from 'srvx/aws-lambda'

import { createApp } from './app.mjs'

const ready = createApp().then(async (app) => {
  await app.init()
  return app.getServer().fetch
})

export const handler: AWSLambdaHandler = async (event, context) =>
  handleLambdaEvent(await ready, event, context)
```

- The event and the context of Lambda are in `ctx.raw.request.runtime.awsLambda`.
- `ctx.ip` is the source address that the event names.
- **`serve.trustProxy` does not apply here.** srvx makes the request in `handleLambdaEvent`, which knows nothing of the options of the server and takes the proxies to trust as its fourth argument. Without it, `x-forwarded-for`, `x-forwarded-host` and `x-forwarded-proto` are not read:

  ```ts
  export const handler: AWSLambdaHandler = async (event, context) =>
    handleLambdaEvent(await ready, event, context, 'loopback')
  ```

- The host of `ctx.url` is the `Host` header of the event, or the domain name of its request context. For an event with neither, or with one that is not a host, it is the `_invalid_` of srvx, not `localhost`.
- A `HEAD` request is answered with the headers of `GET` and an empty body.
- `handleLambdaEvent` reads the whole response before it returns, so a stream reaches the client when it has ended. srvx has `handleLambdaEventWithStream` for functions with response streaming; the tests of this adapter do not cover it.
- A body is limited by `serve.maxRequestBodySize`, and before that by what Lambda accepts.

## Deno

```ts title="main.mts"
import { createApp } from './app.mjs'

const app = await createApp()
await app.listen({ port: 3000, hostname: '0.0.0.0' })
```

- `app.listen()` serves with `Deno.serve`, which `app.getServer().deno.server` is.
- `ctx.ip` is the address of the connection, from the `info` that Deno passes with a request, which is `ctx.raw.request.runtime.deno.info`.
- A request without a `Host` header has `localhost` as the host of `ctx.url`, as on the other adapters. Deno puts `localhost` and the port of the server into `request.url`.
- The adapter reads `request.signal` for every request, so that `ctx.signal` knows of a client that has left. Deno prints a note about that signal once per process; the flag `--unstable-no-legacy-abort` that it names turns the note off, and the adapter works with and without it.

## Node.js and Bun

```ts title="main.mts"
const app = await createApp()
const url = await app.listen({ port: 3000, hostname: '0.0.0.0' })
```

`app.listen({ port?, hostname? })` resolves to the server's base URL. What is left out is decided by srvx: the port is the `PORT` environment variable or 3000, and the hostname the `HOST` environment variable or every interface. Pass `port: 0` for an ephemeral port.

`listen()` creates a second server, the one that listens, and `app.getServer()` returns that one from then on. Do not keep the one from before.

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

`middleware`, `plugins` and `error` belong to the server of srvx, so they run for what goes through `app.getServer().fetch` or a socket, and not for `app.inject()`.

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

srvx has no request id, so `ctx.id` is generated by `@navios/server` on first read. `ctx.signal` is the request's own `signal`. `ctx.ip` is `request.ip`: the address of the connection, the client's address behind the proxies that `serve.trustProxy` trusts, on Cloudflare the `cf-connecting-ip` header and on Lambda the source address of the event.

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
- A path that is not valid percent-encoding is a 400 when a route has as many segments as it has, and a 404 when none has: with the routes `/simple` and `/users/$id`, `/users/%zz` is a 400 and `/a/%zz/c` a 404. Fastify answers both with 400.
- Every method that the runtime accepts can be declared.
- A request that the runtime cannot read does not reach the adapter. Node.js answers one with an empty 400 or 431 and closes the connection, where the Fastify adapter answers with a problem response. Add a `clientError` listener to `app.getServer().node.server` after `listen()` to answer it yourself.

On Node.js and on Deno, a request without a `Host` header has `localhost` as the host of `ctx.url`, as on the other adapters, and so has one on Node.js whose header is not a host. `ctx.raw.request.url` has what the runtime puts there: the address of the server, or the `_invalid_` of srvx. On [Lambda](#aws-lambda) the host is not replaced.

## Shutdown

`app.close()` stops accepting connections and waits for requests in flight, streams included, for at most the application's `shutdownTimeout` (10 seconds by default). Then it closes the connections that are left, and the application continues with its shutdown hooks. A connection on which no request was sent is not waited for, and on Node.js a response that is sent while the server closes carries `connection: close`. [Application setup](/docs/server/essentials/application) describes the whole shutdown sequence.

An application that never listened, as on Workers and on Lambda, waits for the requests of `fetch` and `app.inject()` that are in flight.

A stream that is cut because it has outlived the timeout ends as a failure for the client, on every runtime.

## Requirements

- srvx 1.0 or newer (peer dependency)
- A runtime that srvx supports. The adapter is tested in `workerd` with the compatibility dates 2024-09-23 and 2026-01-01, on Deno 2.9, Node.js 24 and 26, and Bun 1.4.5
- `@navios/server` of the same version (peer dependency), with `@navios/core` and `@navios/builder`
