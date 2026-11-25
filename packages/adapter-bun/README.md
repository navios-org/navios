# @navios/adapter-bun

Runs a [Navios](https://navios.tech) application on `Bun.serve`. The adapter registers the application's routes with Bun's router, turns each `Request` into the input of a compiled route and builds a `Response` from the result. Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter.

**[Documentation](https://navios.tech/docs/server/adapters/bun)** · [Server quick start](https://navios.tech/docs/server/quick-start)

## Install

```bash
bun add @navios/adapter-bun@next @navios/server@next @navios/builder@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

Requires Bun 1.4.5 or newer. The adapter has no runtime dependencies of its own.

## Example

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/server'

import type { BunEnvironment } from '@navios/adapter-bun'

import { AppModule } from './app.module.mjs'

// Types ctx.raw, app.getServer() and the options of app.listen() for Bun
declare module '@navios/server' {
  interface Register {
    environment: BunEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    cors: {
      origin: ['https://app.example.com', /\.example\.org$/],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    serve: {
      maxRequestBodySize: 10 * 1024 * 1024,
      idleTimeout: 30,
    },
  }),
})

const url = await app.listen({ port: 3000, hostname: '0.0.0.0' })
```

`defineBunEnvironment(options)` takes two options, both optional: `cors`, and `serve` for extra `Bun.serve` options such as `tls`. `AppModule` is an ordinary Navios module, such as the one with `getUser` at `/users/$userId` from the [quick start](https://navios.tech/docs/server/quick-start); nothing in it depends on the adapter.

## What else it does

| Need                                | How                                                         | Docs                                                                                              |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| TLS, timeouts, other server options | `serve`                                                     | [Options](https://navios.tech/docs/server/adapters/bun#options)                                   |
| The native `Request` and `Server`   | the `Register` declaration, `ctx.raw`                       | [What `ctx.raw` contains](https://navios.tech/docs/server/adapters/bun#what-ctxraw-contains)      |
| CORS                                | `cors`: `origin`, `credentials`, `methods`, `maxAge`, ...   | [CORS](https://navios.tech/docs/server/adapters/bun#cors)                                         |
| File uploads                        | `body: 'multipart'`, no option needed                       | [Multipart](https://navios.tech/docs/server/adapters/bun#multipart)                               |
| Body size limit                     | `serve.maxRequestBodySize`, answered with a 413 problem     | [Body size limit](https://navios.tech/docs/server/adapters/bun#body-size-limit)                   |
| Streaming responses                 | `response: 'stream'`; there is no native reply to take over | [Taking over the response](https://navios.tech/docs/server/adapters/bun#taking-over-the-response) |
| WebSockets                          | `serve.websocket`, `ctx.raw.server.upgrade()`               | [WebSockets](https://navios.tech/docs/server/adapters/bun#websockets)                             |
| Graceful shutdown                   | `app.close()`, `shutdownTimeout`                            | [Shutdown](https://navios.tech/docs/server/adapters/bun#shutdown)                                 |
| Tests without a socket              | `app.inject()`                                              | [Testing](https://navios.tech/docs/server/essentials/testing)                                     |

## Development

The adapter is tested with the shared suite from `@navios/server/conformance`, over real HTTP on an ephemeral port, using `bun:test`; the spec is `e2e/conformance.spec.mts`. `e2e/cors.spec.mts` covers CORS, which is specific to this adapter. [Writing an adapter](https://navios.tech/docs/server/adapters/writing-an-adapter#running-the-conformance-suite) describes the suite.

```bash
cd packages/adapter-bun && bun test

# or from the repository root
yarn turbo run test:ci --filter=@navios/adapter-bun
```

## Upgrading from 1.x

CORS is an adapter option in 2.0, and the adapter is passed to `NaviosFactory.create` as a single definition. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
