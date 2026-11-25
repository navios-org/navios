# Navios

Navios is a set of TypeScript packages built around one idea: describe an HTTP endpoint once, and use that declaration everywhere. A client calls it, a server implements it, and React hooks are derived from it, all with the same types and the same runtime validation.

**[Documentation](https://navios.tech)** · [Builder](https://navios.tech/docs/builder/) · [Server](https://navios.tech/docs/server/) · [DI](https://navios.tech/docs/di/)

## Example

Declare an endpoint with `@navios/builder`. Any [Standard Schema](https://standardschema.dev) library works; this example uses Zod.

```ts
// users.mts
import { builder } from '@navios/builder'
import { z } from 'zod/v4'

export const API = builder()

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})
```

Implement it on a server with `@navios/server`. The handler's parameters and return value are checked against the declaration.

```ts
// server.mts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { Controller, Endpoint, Module, NaviosFactory } from '@navios/server'

import type { HandlerParams } from '@navios/server'

import { getUser } from './users.mjs'

@Controller()
class UsersController {
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return { id: urlParams.userId, name: 'Ada' }
  }
}

@Module({ controllers: [UsersController] })
class AppModule {}

const app = await NaviosFactory.create(AppModule, { adapter: defineFastifyEnvironment() })
await app.listen({ port: 3000 })
```

Call it from a client. Input is validated before the request is sent and the response before your code sees it.

```ts
// client.mts
import { create } from '@navios/http'

import { API, getUser } from './users.mjs'

API.provideClient(create({ baseURL: 'http://localhost:3000' }))

const user = await getUser({ urlParams: { userId: '42' } })
//    ^? { id: string; name: string }
```

## Install

A server on Node.js, and the client of the example:

```bash
npm install @navios/server@next @navios/builder@next @navios/adapter-fastify@next fastify zod
```

```bash
npm install @navios/builder@next @navios/http@next zod
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases. `@navios/core` and `@navios/di` come with the server. Node.js 22 or newer is required, or Bun 1.3.10 or newer.

## Packages

| Package                                                 | What it is                                            | Docs                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| [`@navios/builder`](./packages/builder)                 | Endpoint declarations and the typed client            | [Builder](https://navios.tech/docs/builder/)                            |
| [`@navios/react-query`](./packages/react-query)         | TanStack Query hooks derived from declarations        | [React Query](https://navios.tech/docs/builder/react-query/)            |
| [`@navios/http`](./packages/navios)                     | A small `fetch`-based HTTP client                     | [HTTP client](https://navios.tech/docs/builder/essentials/http-client)  |
| [`@navios/server`](./packages/server)                   | The server framework                                  | [Server](https://navios.tech/docs/server/)                              |
| [`@navios/core`](./packages/core)                       | Modules, plugins and lifecycle, without HTTP          | [Other transports](https://navios.tech/docs/server/guides/other-transports) |
| [`@navios/adapter-fastify`](./packages/adapter-fastify) | Runs a server on Fastify and Node.js                  | [Fastify](https://navios.tech/docs/server/adapters/fastify)             |
| [`@navios/adapter-bun`](./packages/adapter-bun)         | Runs a server on `Bun.serve`                          | [Bun](https://navios.tech/docs/server/adapters/bun)                     |
| [`@navios/adapter-xml`](./packages/adapter-xml)         | XML responses written as JSX                          | [XML responses](https://navios.tech/docs/server/adapters/xml)           |
| [`@navios/jwt`](./packages/jwt)                         | Signing and verifying JSON Web Tokens                 | [Authentication](https://navios.tech/docs/server/guides/authentication) |
| [`@navios/schedule`](./packages/schedule)               | Cron jobs                                             | [Scheduled jobs](https://navios.tech/docs/server/guides/scheduled-jobs) |
| [`@navios/microservice`](./packages/microservice)       | Message handlers on a queue                           | [Messages](https://navios.tech/docs/server/guides/other-transports#messages) |
| [`@navios/queues`](./packages/queues)                   | Queue clients and typed messages                      | [README](./packages/queues/README.md)                                   |
| [`@navios/openapi`](./packages/openapi)                 | An OpenAPI document generated from the routes         | [OpenAPI](https://navios.tech/docs/server/guides/openapi)               |
| [`@navios/otel`](./packages/otel)                       | OpenTelemetry traces and metrics                      | [OpenTelemetry](https://navios.tech/docs/server/opentelemetry/)         |
| [`@navios/di`](./packages/di)                           | The dependency injection container, usable on its own | [DI](https://navios.tech/docs/di/)                                      |
| [`@navios/di-react`](./packages/di-react)               | React bindings for the container                      | [DI React](https://navios.tech/docs/di/react/)                          |
| [`@navios/commander`](./packages/commander)             | A CLI framework on the same module and DI model       | [Commander](https://navios.tech/docs/commander/getting-started)         |

## Development

The repository is a Yarn workspace driven by Turborepo.

```bash
yarn install
```

```bash
yarn build
```

```bash
yarn test:ci
```

```bash
yarn lint
```

To work on one package, filter the task: `yarn turbo run test:ci --filter=@navios/server`. The docs site lives in `apps/docs`.

## License

MIT
