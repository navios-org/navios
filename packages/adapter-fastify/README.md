# @navios/adapter-fastify

Runs a `@navios/core` application on [Fastify](https://fastify.dev) 5, on Node.js.

The adapter registers the application's routes with Fastify, turns each Fastify request into the input of a compiled Navios route and writes the result. Guards, validation and error mapping happen in core and behave the same as on every other adapter. Fastify's own schema validation and serialisation are not used.

This README describes version 2.0. For the application API see the [`@navios/core` documentation](../core/docs/README.md).

## Install

```bash
yarn add @navios/adapter-fastify @navios/core @navios/builder fastify
```

`@fastify/cors` and `@fastify/multipart` are dependencies of the adapter and do not need to be installed separately.

## Usage

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './app.module.mjs'

declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    cors: { origin: true },
    multipart: true,
  }),
})

const url = await app.listen({ port: 3000, host: '0.0.0.0' })
```

`app.listen()` takes Fastify's listen options and resolves to the server's address.

## Options

`defineFastifyEnvironment(options)` accepts every option of the `fastify()` factory (`logger`, `bodyLimit`, `trustProxy`, `http2`, and so on) and three of its own:

| Option      | Type                                                 | Meaning                                                                                               |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cors`      | `FastifyCorsOptions`                                 | Registers `@fastify/cors` with these options.                                                         |
| `multipart` | `FastifyMultipartOptions \| true`                    | Registers `@fastify/multipart`. Required for endpoints declared with `body: 'multipart'`.             |
| `configure` | `(server: FastifyInstance) => void \| Promise<void>` | Called with the Fastify instance before any route is registered, to add plugins, hooks or decorators. |

```ts
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

All options are optional. In 1.x CORS and multipart were enabled with `app.enableCors()` and `app.enableMultipart()`; those methods no longer exist.

## The `Register` declaration

```ts
declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

Write this once in the application. It makes `ctx.raw` and `app.getServer()` typed everywhere. Without it `ctx.raw` is `unknown`. The adapter does not declare it for you, because a package may have more than one adapter installed.

## What `ctx.raw` contains

```ts
ctx.raw.request // FastifyRequest
ctx.raw.reply // FastifyReply
```

```ts
@Endpoint(whoami)
async whoami(_params: HandlerParams<typeof whoami>, ctx: RequestContext) {
  return {
    ip: ctx.raw.request.ip,
    protocol: ctx.raw.request.protocol,
  }
}
```

`ctx.id` is Fastify's `request.id`. `app.getServer()` returns the `FastifyInstance` after `init()`.

Prefer the adapter-neutral members of the context (`ctx.headers`, `ctx.cookies`, `ctx.reply.header()`, `ctx.signal`) where they cover the need; code that uses `ctx.raw` runs on this adapter only.

## Taking over the response

A handler may write the response itself through the native reply. When `reply.sent` is true after the handler returns, which is the case after `reply.send()` or `reply.hijack()`, the adapter writes nothing.

```ts
export const legacyDownload = api.declareEndpoint({
  method: 'GET',
  url: '/legacy/$id',
  response: 'void',
})

// in a controller
@Endpoint(legacyDownload)
async legacyDownload({ urlParams }: HandlerParams<typeof legacyDownload>, ctx: RequestContext) {
  const { reply } = ctx.raw
  reply.hijack()
  reply.raw.writeHead(200, { 'content-type': 'application/pdf' })
  await this.reports.pipe(urlParams.id, reply.raw)
}
```

Things to know:

- Headers and cookies set with `ctx.reply` are not sent on a response that was taken over. Set them on the native reply.
- Once the native reply has been sent or hijacked, core skips response validation and ignores the handler's return value, whatever the endpoint declares.
- Request scopes and request values are still released when the connection finishes.

Use this for cases the framework does not cover. For ordinary streaming, return a `ReadableStream` or an async iterable from an endpoint declared with `response: 'stream'`; that code also runs on Bun.

## CORS

`cors` is passed to `@fastify/cors` unchanged; see that plugin's documentation for the options.

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

Enable `@fastify/multipart` with `multipart: true` or with its options:

```ts
defineFastifyEnvironment({
  multipart: { limits: { fileSize: 10 * 1024 * 1024, files: 5 } },
})
```

An endpoint declared with `body: 'multipart'` then receives text fields as strings and files as `File` objects in `data`, validated by the endpoint's `requestSchema`. See [Controllers and handlers](../core/docs/controllers.md#multipart-bodies).

Limitations:

- Each file is read into memory before the handler runs. Set `limits.fileSize`.
- A body over one of the `limits` (`fileSize`, `files`, `fields`, `parts`, `fieldSize`, `fieldNameSize`) is answered with a 413 `application/problem+json` response, and the handler does not run. `@fastify/multipart` would truncate a field over `fieldSize`; the adapter rejects it instead.
- Without the `multipart` option, a multipart request is rejected by Fastify with 415.

## Request bodies

- JSON bodies are collected as text and parsed only when the pipeline asks for the body, which is after guards have passed. `bodyLimit` is enforced while collecting. A malformed JSON body is a 400 problem response with `source: 'body'`.
- An empty JSON body is `undefined`.
- Errors raised by Fastify itself, such as 413 for a body over the limit or 415 for an unsupported content type, are answered as `application/problem+json`.

## Shutdown

`app.close()` calls `fastify.close()` and waits for it, for at most the application's `shutdownTimeout` (10 seconds by default). Fastify stops accepting connections and lets in-flight requests finish.

When the timeout passes, the adapter closes the remaining connections, which aborts the `ctx.signal` of requests that are still running, and the application continues with its shutdown hooks.

## Testing

`app.inject(request)` goes through `fastify.inject()`, so Fastify's parsing, hooks and plugins take part without opening a socket. See [Testing](../core/docs/testing.md).

## Conformance suite

The adapter is tested with the shared suite from `@navios/core/conformance`, over real HTTP on an ephemeral port. The spec is `e2e/conformance.spec.mts`:

```ts
import { runAdapterConformance } from '@navios/core/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineFastifyEnvironment } from '../src/index.mjs'

const BODY_LIMIT = 64 * 1024

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'fastify',
  adapter: () =>
    defineFastifyEnvironment({
      bodyLimit: BODY_LIMIT,
      multipart: { limits: { fileSize: BODY_LIMIT } },
    }),
  listenOptions: { port: 0, host: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
```

Run it from the repository root:

```bash
yarn turbo run test:ci --filter=@navios/adapter-fastify
```

The HTTP benchmark compares the adapter with raw Fastify doing the same validation by hand:

```bash
cd packages/adapter-fastify
yarn bench
```

## Requirements

- Node.js
- `fastify` 5.6 or newer (peer dependency)
- `@navios/core` 2.x and `@navios/builder` (peer dependencies)

## License

MIT
