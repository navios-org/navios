# @navios/adapter-srvx

Runs a [Navios](https://navios.tech) application on [srvx](https://srvx.h3.dev): on Node.js, Deno and Bun with `app.listen()`, and with a `fetch` handler on runtimes that call the application themselves, such as Cloudflare Workers. The adapter finds the route of each `Request`, turns it into the input of a compiled route and builds a `Response` from the result. Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter.

**[Documentation](https://navios.tech/docs/server/adapters/srvx)** · [Server quick start](https://navios.tech/docs/server/quick-start)

## Install

```bash
npm install @navios/adapter-srvx@next @navios/server@next @navios/builder@next srvx
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

On Bun alone, use [`@navios/adapter-bun`](https://navios.tech/docs/server/adapters/bun): it is faster there, and this adapter logs a warning when it listens on Bun.

Requires srvx 1.0 or newer, which is a peer dependency, and Node.js 24 or newer, Bun 1.4.5 or newer, or another runtime that srvx supports.

## Example

```ts
import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { NaviosFactory } from '@navios/server'

import type { SrvxEnvironment } from '@navios/adapter-srvx'

import { AppModule } from './app.module.mjs'

// Types ctx.raw, app.getServer() and the options of app.listen() for srvx
declare module '@navios/server' {
  interface Register {
    environment: SrvxEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineSrvxEnvironment({
    cors: {
      origin: ['https://app.example.com', /\.example\.org$/],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    serve: {
      maxRequestBodySize: 10 * 1024 * 1024,
    },
  }),
})

const url = await app.listen({ port: 3000, hostname: '0.0.0.0' })
```

`defineSrvxEnvironment(options)` takes two options, both optional: `cors`, and `serve` for extra options of srvx such as `tls` or `trustProxy`. `AppModule` is an ordinary Navios module, such as the one with `getUser` at `/users/$userId` from the [quick start](https://navios.tech/docs/server/quick-start); nothing in it depends on the adapter.

Where the runtime calls the application, do not listen. Initialise the application and hand over the `fetch` of its server:

```ts
await app.init()
const { fetch } = app.getServer()
```

[Runtimes that call `fetch`](https://navios.tech/docs/server/adapters/srvx#runtimes-that-call-fetch) has a complete Cloudflare Worker.

## What else it does

| Need                                     | How                                                       | Docs                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Workers and other `fetch` runtimes       | `app.init()`, `app.getServer().fetch`                     | [Runtimes that call `fetch`](https://navios.tech/docs/server/adapters/srvx#runtimes-that-call-fetch) |
| TLS, proxies, middleware, server options | `serve`                                                   | [Options](https://navios.tech/docs/server/adapters/srvx#options)                                     |
| The request and the objects of a runtime | the `Register` declaration, `ctx.raw`                     | [What `ctx.raw` contains](https://navios.tech/docs/server/adapters/srvx#what-ctxraw-contains)        |
| CORS                                     | `cors`: `origin`, `credentials`, `methods`, `maxAge`, ... | [CORS](https://navios.tech/docs/server/adapters/srvx#cors)                                           |
| File uploads                             | `body: 'multipart'`, no option needed                     | [Multipart](https://navios.tech/docs/server/adapters/srvx#multipart)                                 |
| Body size limit                          | `serve.maxRequestBodySize`, answered with a 413 problem   | [Body size limit](https://navios.tech/docs/server/adapters/srvx#body-size-limit)                     |
| Streaming responses                      | `response: 'stream'`                                      | [Streams and server-sent events](https://navios.tech/docs/server/guides/streams-and-sse)             |
| Graceful shutdown                        | `app.close()`, `shutdownTimeout`                          | [Shutdown](https://navios.tech/docs/server/adapters/srvx#shutdown)                                   |
| Tests without a socket                   | `app.inject()`                                            | [Testing](https://navios.tech/docs/server/essentials/testing)                                        |

It has no WebSockets, and a handler cannot write the response itself.

## Development

The adapter is tested with the shared suite from `@navios/server/conformance`, over real HTTP on an ephemeral port: on Node.js with Vitest (`e2e/conformance.spec.mts`) and on Bun with `bun:test` (`e2e/bun`). `e2e/serve.spec.mts` covers what is specific to this adapter, and `e2e/workers.spec.mts` runs it against srvx's build for Cloudflare Workers, under Node.js. [Writing an adapter](https://navios.tech/docs/server/adapters/writing-an-adapter#running-the-conformance-suite) describes the suite.

```bash
cd packages/adapter-srvx && yarn test:ci

# or from the repository root
yarn turbo run test:ci --filter=@navios/adapter-srvx
```

## License

MIT
