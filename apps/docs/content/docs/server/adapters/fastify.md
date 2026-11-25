---
title: Fastify
---

# Fastify

`@navios/adapter-fastify` runs a Navios application on [Fastify](https://fastify.dev) 5, on Node.js. The adapter registers the application's routes with Fastify, turns each Fastify request into the input of a compiled route and writes the result. Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter; Fastify's own schema validation and serialisation are not used.

## Install and use

```bash
npm install @navios/adapter-fastify@next fastify
```

`@fastify/cors` and `@fastify/multipart` are dependencies of the adapter and do not need to be installed separately.

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    cors: {
      origin: ['https://app.example.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    multipart: true,
  }),
})

const url = await app.listen({ port: 3000, host: '0.0.0.0' })
```

`app.listen()` takes Fastify's listen options and resolves to the server's address. It needs a `port`, or the `path` of a unix socket. Without a `host`, Fastify listens on `localhost`, on each of its addresses. `app.getServer()` returns the `FastifyInstance` once the application is initialised.

In tests, `app.inject()` goes through `fastify.inject()`, so Fastify's parsing, hooks and plugins take part without opening a socket. See [Testing](/docs/server/essentials/testing).

## Options

`defineFastifyEnvironment(options)` accepts the options of the `fastify()` factory for an HTTP/1.1 server, such as `logger`, `bodyLimit`, `trustProxy` and `https`, and three of its own. All are optional. Fastify's `http2` is not supported.

| Option      | Type                                                 | Meaning                                                                                               |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cors`      | `FastifyCorsOptions`                                 | Registers `@fastify/cors` with these options. See [CORS](#cors).                                      |
| `multipart` | `MultipartOptions \| true`                           | Registers `@fastify/multipart`. Required for endpoints declared with `body: 'multipart'`.             |
| `configure` | `(server: FastifyInstance) => void \| Promise<void>` | Called with the Fastify instance before any route is registered, to add plugins, hooks or decorators. |

```ts
import helmet from '@fastify/helmet'

defineFastifyEnvironment({
  bodyLimit: 1_048_576,
  trustProxy: true,
  configure: async (server) => {
    await server.register(helmet)
    server.addHook('onRequest', async (request) => {
      request.log.info({ url: request.url }, 'incoming')
    })
  },
})
```

`configure` runs after the CORS and multipart plugins have been registered. Plugins that it registers are loaded before the adapter goes on, whether or not it awaits them. A [plugin](/docs/server/guides/plugins) can reach the same Fastify instance when the setup belongs in a reusable package.

## The `Register` declaration

```ts
import type { FastifyEnvironment } from '@navios/adapter-fastify'

declare module '@navios/server' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

Write this once in the application, usually next to `NaviosFactory.create`. It types `ctx.raw`, `app.getServer()` and the options of `app.listen()` for Fastify. [Request context](/docs/server/essentials/request-context) explains the mechanism and what happens without the declaration.

## What `ctx.raw` contains

| Member            | Type             |
| ----------------- | ---------------- |
| `ctx.raw.request` | `FastifyRequest` |
| `ctx.raw.reply`   | `FastifyReply`   |

```ts
// whoami is declared with GET /whoami and a responseSchema of { ips }
@Endpoint(whoami)
async whoami(_params: HandlerParams<typeof whoami>, ctx: RequestContext) {
  return { ips: ctx.raw.request.ips ?? [] }
}
```

On this adapter `ctx.id` is Fastify's `request.id`, and `ctx.signal` aborts when the connection closes before the response has been written completely. `ctx.ip` and the protocol and host of `ctx.url` are Fastify's `request.ip`, `request.protocol` and `request.host`, so the `trustProxy` option applies to them. In a test request without a `remoteAddress`, `request.ip` is the `127.0.0.1` of Fastify's own `inject()`, and `ctx.ip` is `undefined`.

Code that uses `ctx.raw` runs on this adapter only. Prefer the adapter-neutral members of the context (`ctx.ip`, `ctx.headers`, `ctx.cookies`, `ctx.reply.header()`, `ctx.signal`) where they cover the need.

## Taking over the response

A handler may write the response itself through the native reply. When `reply.sent` is true after the handler returns, which is the case after `reply.send()` or `reply.hijack()`, the adapter writes nothing.

```ts
export const legacyDownload = API.declareEndpoint({
  method: 'GET',
  url: '/legacy/$reportId',
  response: 'void',
})

// in a controller
@Endpoint(legacyDownload)
async legacyDownload({ urlParams }: HandlerParams<typeof legacyDownload>, ctx: RequestContext) {
  const { reply } = ctx.raw
  reply.hijack()
  reply.raw.writeHead(200, { 'content-type': 'application/pdf' })
  await this.reports.pipe(urlParams.reportId, reply.raw)
}
```

- Headers and cookies set with `ctx.reply` are not sent on a response that was taken over. Set them on the native reply.
- The pipeline skips response validation and ignores the handler's return value, whatever the endpoint declares.
- The request is released when that response has ended, so `ctx.use()` and `ctx.onFinish()` work until then. `ctx.responseStatus` is the status the handler wrote.
- A handler that throws after `reply.hijack()`, before it wrote anything, closes the connection. One that returns may write later, with any status.

Use this for cases the framework does not cover. For ordinary streaming, return a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`, as described in [Streams and server-sent events](/docs/server/guides/streams-and-sse); that code also runs on Bun.

## CORS

`cors` is passed to `@fastify/cors` unchanged. See that plugin's documentation for the options. Set `methods`: by default the plugin allows a preflight request the methods `GET`, `HEAD` and `POST`, so that browsers refuse to send a `PUT` or a `DELETE`.

```ts
defineFastifyEnvironment({
  cors: {
    origin: ['https://app.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
})
```

Every response carries the headers, including those of errors and of URLs that the router rejects. A `Vary` header that a handler sets is sent next to the one of the plugin.

## Multipart

Enable `@fastify/multipart` with `multipart: true`, or with its options to set limits:

```ts
defineFastifyEnvironment({
  multipart: { limits: { fileSize: 10 * 1024 * 1024, files: 5 } },
})
```

An endpoint declared with `body: 'multipart'` then receives text fields as strings and files as `File` objects, validated by the endpoint's `requestSchema`. [File uploads](/docs/server/guides/file-uploads) covers the handler side.

- All parts are read into memory before the handler runs. Together they may have as many bytes as `bodyLimit`, and what `limits` allow on top: `fileSize` for each of `files`, and `fieldSize` for each of `fields`, one of each when the number is not set. A body over that is answered with 413. So set `limits.fileSize` for files larger than `bodyLimit`, and `limits.files` to accept several of them.
- A request over any of the `limits` (`fileSize`, `files`, `fields`, `parts`, `fieldSize`, `fieldNameSize`) is answered with a 413 problem response, and the handler does not run. That includes a text field longer than `fieldSize`, which is rejected rather than truncated.
- The name of a file is never a path: `../../etc/passwd` arrives as `passwd`. A part without a name is left out.
- Without the `multipart` option, an endpoint declared with `body: 'multipart'` makes `init()` throw an error that names the route, unless `configure` registers `@fastify/multipart` itself.
- The adapter collects the parts itself, so the options of the plugin that do that (`attachFieldsToBody`, `onFile`, `sharedSchemaId`) are not accepted.

## Request bodies

- Fastify collects a body of any type as bytes, before the handler and its guards, and the server [decodes it by its content type](/docs/server/essentials/controllers#request-bodies) when the pipeline asks for it. A multipart body is not collected before that.
- Fastify hooks see the undecoded `Buffer` in `request.body`. A hook may set another body, which is then taken as it is.
- A content type parser that `configure` adds keeps its content type: what it makes of a body goes to validation as it is, and `ctx.rawBody()` is not available for it.
- `bodyLimit` (1 MiB by default, a Fastify option) is enforced while the body is collected.
- When a request has two `Content-Type` headers, Node keeps the first.

## Errors outside the pipeline

Errors that Fastify, a plugin or a hook raises are answered as `application/problem+json`, like the errors described in [Errors](/docs/server/essentials/errors). Error mappers do not apply to them, because there is no route.

| Error                                                          | Answer                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `HttpException` of `@navios/server`                            | Its status and body.                                                       |
| An error with a 4xx `statusCode`, such as 413 over `bodyLimit` | That status, with the message as `detail`.                                 |
| An error with a `statusCode` from 501 to 599                   | That status, without the message. The error is logged.                     |
| Any other error                                                | 500, from the application's internal-error responder. The error is logged. |
| What the router rejects, or Node cannot read as a request      | 400, 414 or 431, and 408 for a request that does not arrive in time.       |

Pass `frameworkErrors` or `clientErrorHandler`, which are Fastify options, to answer the last row yourself.

## Shutdown

`app.close()` calls `fastify.close()` and waits for it, for at most the application's `shutdownTimeout` (10 seconds by default). Fastify stops accepting connections and lets in-flight requests finish. The adapter does not wait for keep-alive connections: responses sent while the server closes carry `connection: close`, and connections that become idle, or that never sent a request, are dropped.

When the timeout passes, the adapter closes the remaining connections, including those that were upgraded, such as WebSockets. That aborts the `ctx.signal` of requests that are still running, and the application continues with its shutdown hooks. A plugin that keeps connections of its own, such as `@fastify/websocket`, closes them earlier, in its `preClose` hook. [Application setup](/docs/server/essentials/application) describes the whole shutdown sequence.

Listening on `localhost` opens one socket per address, and only the connections of the first are known to the adapter. In production, pass a `host` such as `0.0.0.0`.

## Requirements

- Node.js 22 or newer
- `fastify` 5.6 or newer (peer dependency)
- `@navios/server` of the same version (peer dependency), with `@navios/builder`
