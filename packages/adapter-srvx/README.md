# @navios/adapter-srvx

Runs a [Navios](https://navios.tech) application where the other adapters do not reach: on Cloudflare Workers, AWS Lambda, Deno and any other runtime that hands an application a web `Request` and takes a `Response`. It is built on [srvx](https://srvx.h3.dev). Guards, validation and error mapping happen in `@navios/server` and behave the same as on every other adapter.

**[Documentation](https://navios.tech/docs/server/adapters/srvx)** · [Server quick start](https://navios.tech/docs/server/quick-start)

## When to use it

| Runtime            | Adapter                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| Cloudflare Workers | this one                                                                      |
| AWS Lambda         | this one, with `srvx/aws-lambda`                                              |
| Deno               | this one                                                                      |
| Node.js            | [`@navios/adapter-fastify`](https://navios.tech/docs/server/adapters/fastify) |
| Bun                | [`@navios/adapter-bun`](https://navios.tech/docs/server/adapters/bun)         |

The adapter runs on Node.js and on Bun as well, for an application that has to run there and on one of the others. On Bun alone the Bun adapter is faster, and this one logs a warning when it listens there. On Node.js alone Fastify has more options, and this adapter has not been measured to be faster.

## Install

```bash
npm install @navios/adapter-srvx@next @navios/server@next @navios/core@next @navios/builder@next srvx
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

srvx 1.0 or newer is a peer dependency.

## Example

```ts
import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { NaviosFactory } from '@navios/server'

import type { SrvxEnvironment } from '@navios/adapter-srvx'
import type { CloudflareFetchHandler, Server } from 'srvx'

import { AppModule } from './app.module.mjs'

// Types ctx.raw, app.getServer() and the options of app.listen() for srvx
declare module '@navios/server' {
  interface Register {
    environment: SrvxEnvironment
  }
}

async function start(): Promise<CloudflareFetchHandler> {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineSrvxEnvironment({
      cors: { origin: ['https://app.example.com'] },
      serve: { maxRequestBodySize: 1024 * 1024 },
    }),
  })
  // A Worker does not listen: the runtime calls `fetch`.
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

This is a Cloudflare Worker, which needs the `nodejs_compat` compatibility flag and a compatibility date of 2024-09-23 or later. On Lambda the same `fetch` is given to `handleLambdaEvent` of `srvx/aws-lambda`, and on Deno, Node.js and Bun the application listens with `app.listen({ port, hostname })`. The documentation has each of them.

`defineSrvxEnvironment(options)` takes two options, both optional: `cors`, and `serve` for extra options of srvx such as `tls` or `trustProxy`. `AppModule` is an ordinary Navios module, such as the one with `getUser` at `/users/$userId` from the [quick start](https://navios.tech/docs/server/quick-start); nothing in it depends on the adapter.

## What else it does

| Need                                     | How                                                       | Docs                                                                                          |
| ---------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cloudflare Workers                       | `app.init()`, `app.getServer().fetch`                     | [Cloudflare Workers](https://navios.tech/docs/server/adapters/srvx#cloudflare-workers)        |
| AWS Lambda                               | `handleLambdaEvent(fetch, event, context)`                | [AWS Lambda](https://navios.tech/docs/server/adapters/srvx#aws-lambda)                        |
| Deno                                     | `app.listen()`                                            | [Deno](https://navios.tech/docs/server/adapters/srvx#deno)                                    |
| TLS, proxies, middleware, server options | `serve`                                                   | [Options](https://navios.tech/docs/server/adapters/srvx#options)                              |
| The request and the objects of a runtime | the `Register` declaration, `ctx.raw`                     | [What `ctx.raw` contains](https://navios.tech/docs/server/adapters/srvx#what-ctxraw-contains) |
| CORS                                     | `cors`: `origin`, `credentials`, `methods`, `maxAge`, ... | [CORS](https://navios.tech/docs/server/adapters/srvx#cors)                                    |
| File uploads                             | `body: 'multipart'`, no option needed                     | [Multipart](https://navios.tech/docs/server/adapters/srvx#multipart)                          |
| Body size limit                          | `serve.maxRequestBodySize`, answered with a 413 problem   | [Body size limit](https://navios.tech/docs/server/adapters/srvx#body-size-limit)              |
| Streaming responses                      | `response: 'stream'`                                      | [Streams and server-sent events](https://navios.tech/docs/server/guides/streams-and-sse)      |
| Graceful shutdown                        | `app.close()`, `shutdownTimeout`                          | [Shutdown](https://navios.tech/docs/server/adapters/srvx#shutdown)                            |
| Tests without a socket                   | `app.inject()`                                            | [Testing](https://navios.tech/docs/server/essentials/testing)                                 |

It has no WebSockets, and a handler cannot write the response itself.

`app.inject()` calls the adapter, not srvx: routing and CORS are those of a real request, but `serve.middleware`, `serve.plugins` and `serve.error` take no part in it. To test those, send a `Request` to `app.getServer().fetch`.

## Development

The adapter is tested on every runtime it is for. [Writing an adapter](https://navios.tech/docs/server/adapters/writing-an-adapter#running-the-conformance-suite) describes the conformance suite.

| Runtime            | Test                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| Cloudflare Workers | `e2e/workerd.spec.mts` bundles a Worker with esbuild and runs it in `workerd`           |
| AWS Lambda         | `e2e/lambda.spec.mts` sends events of API Gateway through `srvx/aws-lambda`             |
| Deno               | `e2e/deno`, the conformance suite with `deno test`                                      |
| Node.js            | `e2e/conformance.spec.mts`, the conformance suite with Vitest, and `e2e/serve.spec.mts` |
| Bun                | `e2e/bun`, the conformance suite with `bun:test`                                        |

`yarn test:ci` needs Bun and Deno installed.

```bash
yarn turbo run test:ci --filter=@navios/adapter-srvx
```

## License

MIT
