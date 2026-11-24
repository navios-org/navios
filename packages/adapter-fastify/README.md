# @navios/adapter-fastify

Runs a [Navios](https://navios.tech) application on [Fastify](https://fastify.dev) 5, on Node.js. The adapter registers the application's routes with Fastify, turns each Fastify request into the input of a compiled route and writes the result. Guards, validation and error mapping happen in `@navios/core` and behave the same as on every other adapter; Fastify's own schema validation and serialisation are not used.

**[Documentation](https://navios.tech/docs/server/adapters/fastify)** · [Server quick start](https://navios.tech/docs/server/quick-start)

## Install

```bash
npm install @navios/adapter-fastify @navios/core @navios/builder fastify
```

Requires Node.js and `fastify` 5.6 or newer. `@fastify/cors` and `@fastify/multipart` are dependencies of the adapter and do not need to be installed separately.

## Example

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './app.module.mjs'

// Types ctx.raw, app.getServer() and the options of app.listen() for Fastify
declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    bodyLimit: 1_048_576,
    cors: { origin: ['https://app.example.com'], credentials: true },
    multipart: { limits: { fileSize: 10 * 1024 * 1024, files: 5 } },
    configure: async (server) => {
      server.addHook('onRequest', async (request) => {
        request.log.info({ url: request.url }, 'incoming')
      })
    },
  }),
})

const url = await app.listen({ port: 3000, host: '0.0.0.0' })
```

`defineFastifyEnvironment(options)` accepts every option of the `fastify()` factory and three of its own: `cors`, `multipart` and `configure`. `AppModule` is an ordinary Navios module, such as the one with `getUser` at `/users/$userId` from the [quick start](https://navios.tech/docs/server/quick-start); nothing in it depends on the adapter.

## What else it does

| Need                                   | How                                                   | Docs                                                                                                  |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Fastify options, plugins, hooks        | `logger`, `bodyLimit`, `trustProxy`, ..., `configure` | [Options](https://navios.tech/docs/server/adapters/fastify#options)                                   |
| Typed native request and reply         | the `Register` declaration, `ctx.raw`                 | [What `ctx.raw` contains](https://navios.tech/docs/server/adapters/fastify#what-ctxraw-contains)      |
| Writing the response yourself          | `ctx.raw.reply.hijack()`                              | [Taking over the response](https://navios.tech/docs/server/adapters/fastify#taking-over-the-response) |
| CORS                                   | `cors`, passed to `@fastify/cors`                     | [CORS](https://navios.tech/docs/server/adapters/fastify#cors)                                         |
| File uploads and their limits          | `multipart`, `body: 'multipart'`                      | [Multipart](https://navios.tech/docs/server/adapters/fastify#multipart)                               |
| Body size limit, malformed JSON        | `bodyLimit`; errors are `application/problem+json`    | [Request bodies](https://navios.tech/docs/server/adapters/fastify#request-bodies)                     |
| Graceful shutdown                      | `app.close()`, `shutdownTimeout`                      | [Shutdown](https://navios.tech/docs/server/adapters/fastify#shutdown)                                 |
| Tests through Fastify without a socket | `app.inject()`                                        | [Testing](https://navios.tech/docs/server/essentials/testing)                                         |

## Development

The adapter is tested with the shared suite from `@navios/core/conformance`, over real HTTP on an ephemeral port; the spec is `e2e/conformance.spec.mts`. [Writing an adapter](https://navios.tech/docs/server/adapters/writing-an-adapter#running-the-conformance-suite) describes the suite.

```bash
# from the repository root
yarn turbo run test:ci --filter=@navios/adapter-fastify

# HTTP benchmark against raw Fastify doing the same validation by hand
cd packages/adapter-fastify && yarn bench
```

## Upgrading from 1.x

CORS and multipart are adapter options in 2.0, and the adapter is passed to `NaviosFactory.create` as a single definition. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
