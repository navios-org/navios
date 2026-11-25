---
title: Fastify
---

# Fastify

`@navios/adapter-fastify` runs a Navios application on [Fastify](https://fastify.dev) 5, on Node.js. The adapter registers the application's routes with Fastify, turns each Fastify request into the input of a compiled route and writes the result. Guards, validation and error mapping happen in core and behave the same as on every other adapter; Fastify's own schema validation and serialisation are not used.

## Install and use

```bash
yarn add @navios/adapter-fastify fastify
```

`@fastify/cors` and `@fastify/multipart` are dependencies of the adapter and do not need to be installed separately.

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    cors: { origin: true },
    multipart: true,
  }),
})

const url = await app.listen({ port: 3000, host: '0.0.0.0' })
```

`app.listen()` takes Fastify's listen options (`port`, `host`, `path`, and so on) and resolves to the server's address. `app.getServer()` returns the `FastifyInstance` once the application is initialised.

In tests, `app.inject()` goes through `fastify.inject()`, so Fastify's parsing, hooks and plugins take part without opening a socket. See [Testing](/docs/server/essentials/testing).

## Options

`defineFastifyEnvironment(options)` accepts every option of the `fastify()` factory, such as `logger`, `bodyLimit`, `trustProxy` and `http2`, and three of its own. All are optional.

| Option      | Type                                                 | Meaning                                                                                               |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cors`      | `FastifyCorsOptions`                                 | Registers `@fastify/cors` with these options. See [CORS](#cors).                                      |
| `multipart` | `FastifyMultipartOptions \| true`                    | Registers `@fastify/multipart`. Required for endpoints declared with `body: 'multipart'`.             |
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

`configure` runs after the CORS and multipart plugins have been registered. A [plugin](/docs/server/guides/plugins) can reach the same Fastify instance when the setup belongs in a reusable package.

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
// whoami is declared with GET /whoami and a responseSchema of { ip, protocol }
@Endpoint(whoami)
async whoami(_params: HandlerParams<typeof whoami>, ctx: RequestContext) {
  return {
    ip: ctx.raw.request.ip,
    protocol: ctx.raw.request.protocol,
  }
}
```

On this adapter `ctx.id` is Fastify's `request.id`, and `ctx.signal` aborts when the connection closes before the response has been written completely.

Code that uses `ctx.raw` runs on this adapter only. Prefer the adapter-neutral members of the context (`ctx.headers`, `ctx.cookies`, `ctx.reply.header()`, `ctx.signal`) where they cover the need.

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
- Core skips response validation and ignores the handler's return value, whatever the endpoint declares.
- Request scopes and request values are still released when the connection finishes.

Use this for cases the framework does not cover. For ordinary streaming, return a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`, as described in [Streams and server-sent events](/docs/server/guides/streams-and-sse); that code also runs on Bun.

## CORS

`cors` is passed to `@fastify/cors` unchanged. See that plugin's documentation for the options.

```ts
defineFastifyEnvironment({
  cors: {
    origin: ['https://app.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
})
```

## Multipart

Enable `@fastify/multipart` with `multipart: true`, or with its options to set limits:

```ts
defineFastifyEnvironment({
  multipart: { limits: { fileSize: 10 * 1024 * 1024, files: 5 } },
})
```

An endpoint declared with `body: 'multipart'` then receives text fields as strings and files as `File` objects, validated by the endpoint's `requestSchema`. [File uploads](/docs/server/guides/file-uploads) covers the handler side.

- Each file is read into memory before the handler runs. Set `limits.fileSize`.
- A request over any of the `limits` (`fileSize`, `files`, `fields`, `parts`, `fieldSize`, `fieldNameSize`) is answered with a 413 problem response, and the handler does not run. That includes a text field longer than `fieldSize`, which is rejected rather than truncated.
- Without the `multipart` option, Fastify rejects a multipart request with 415.

## Request bodies

- A JSON body is collected as text and parsed only when the pipeline asks for it, which is after guards have passed. An empty JSON body is `undefined`.
- `bodyLimit` (1 MiB by default, a Fastify option) is enforced while the body is collected.
- A malformed JSON body is a 400 problem response with `source: 'body'`.
- Errors raised by Fastify itself, such as 413 for a body over the limit or 415 for an unsupported content type, are answered as `application/problem+json`, like the errors described in [Errors](/docs/server/essentials/errors).

## Shutdown

`app.close()` calls `fastify.close()` and waits for it, for at most the application's `shutdownTimeout` (10 seconds by default). Fastify stops accepting connections and lets in-flight requests finish. The adapter does not wait for keep-alive connections: responses sent while the server closes carry `connection: close`, and connections that become idle, or that never sent a request, are dropped.

When the timeout passes, the adapter closes the remaining connections, which aborts the `ctx.signal` of requests that are still running, and the application continues with its shutdown hooks. [Application setup](/docs/server/essentials/application) describes the whole shutdown sequence.

## Requirements

- Node.js
- `fastify` 5.6 or newer (peer dependency)
- `@navios/server` 2.x and `@navios/builder` 2.x (peer dependencies)
