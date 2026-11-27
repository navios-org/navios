# @navios/server

An HTTP server framework for TypeScript in which a controller implements endpoints declared with [`@navios/builder`](https://www.npmjs.com/package/@navios/builder). The route, the request and response validation and the handler's types all come from the declaration, and a client can call the same declaration with the same types. The HTTP server is chosen by an adapter: Fastify, `Bun.serve`, or [srvx](https://srvx.h3.dev) for Node, Deno, Bun, Cloudflare Workers and AWS Lambda. Application code is the same on all of them.

**[Documentation](https://navios.tech/docs/server/)** · [Quick start](https://navios.tech/docs/server/quick-start) · [How a request is handled](https://navios.tech/docs/server/request-lifecycle)

## Install

```bash
npm install @navios/server@next @navios/core@next @navios/builder@next @navios/adapter-fastify@next fastify zod
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

Node.js 24 or newer is required, or Bun 1.4.5 or newer. On Bun, install [`@navios/adapter-bun`](https://www.npmjs.com/package/@navios/adapter-bun) in place of the two Fastify packages; [`@navios/adapter-srvx`](https://www.npmjs.com/package/@navios/adapter-srvx) serves on Deno, Cloudflare Workers and AWS Lambda as well. `@navios/core` is a peer dependency that the server and its plugins share, and `@navios/di` comes with it. `zod` is what the example uses; any [Standard Schema](https://standardschema.dev) library works. Navios uses standard (TC39) decorators, so leave `experimentalDecorators` off. A project that has to keep it on uses the [legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators) entry point.

## Example

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  inject,
  Injectable,
  Module,
  NaviosFactory,
  reply,
} from '@navios/server'
import { z } from 'zod/v4'

import type { HandlerParams } from '@navios/server'

const API = builder()

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

@Injectable()
class UsersService {
  private readonly users = new Map([['1', { id: '1', name: 'Ada', email: 'ada@example.com' }]])

  findById(id: string) {
    return this.users.get(id) ?? null
  }
}

@Controller()
class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  }
}

@Module({ controllers: [UsersController] })
class AppModule {}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

const url = await app.listen({ port: 3000 })
console.log(`Listening on ${url}`)
```

`GET /users/1` answers `200` with the user, and an unknown id answers `404 {"message":"User not found"}`, the body declared in `errorSchema`. Returning a user without `email`, or `reply()` with a status the declaration does not list, does not compile. Errors the framework produces itself, such as a failed validation, are `application/problem+json`.

## What else it does

| Need                                      | How                                                     | Docs                                                                                          |
| ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Statuses, error bodies, validation        | `reply()`, `responses`, `errorSchema`                   | [Controllers and handlers](https://navios.tech/docs/server/essentials/controllers)            |
| Headers, cookies, the abort signal        | `RequestContext`, the handler's second argument         | [Request context](https://navios.tech/docs/server/essentials/request-context)                 |
| Authorisation, cross-cutting behaviour    | `@UseGuards`, `@UseInterceptors`                        | [Guards and interceptors](https://navios.tech/docs/server/essentials/guards-and-interceptors) |
| Data that belongs to one request          | `createContextKey`, `@RequestValue()`, request scope    | [Per-request state](https://navios.tech/docs/server/guides/request-state)                     |
| Services and their scopes                 | `@Injectable()`, `inject()`                             | [Services](https://navios.tech/docs/server/essentials/services)                               |
| Route prefixes, grouping                  | `@Module()`                                             | [Modules](https://navios.tech/docs/server/essentials/modules)                                 |
| Error responses, domain errors            | `HttpException`, `app.mapError()`                       | [Errors](https://navios.tech/docs/server/essentials/errors)                                   |
| Start-up, shutdown, application options   | `NaviosFactory.create`, `app.close()`                   | [Application setup](https://navios.tech/docs/server/essentials/application)                   |
| Typed configuration, logging              | `provideConfig`, `Logger`                               | [Configuration and logging](https://navios.tech/docs/server/essentials/config-and-logging)    |
| Tests without a socket                    | `defineInMemoryEnvironment`, `createTestClient`         | [Testing](https://navios.tech/docs/server/essentials/testing)                                 |
| File uploads                              | `body: 'multipart'`                                     | [File uploads](https://navios.tech/docs/server/guides/file-uploads)                           |
| Downloads, streams, server-sent events    | `response: 'blob' \| 'text' \| 'stream'`, `sseStream()` | [Streams and server-sent events](https://navios.tech/docs/server/guides/streams-and-sse)      |
| Metadata on controllers and handlers      | `AttributeFactory`                                      | [Attributes](https://navios.tech/docs/server/guides/attributes)                               |
| Reusable setup, extra routes              | `definePlugin`                                          | [Plugins](https://navios.tech/docs/server/guides/plugins)                                     |
| Another HTTP server                       | the `HttpAdapter` contract                              | [Writing an adapter](https://navios.tech/docs/server/adapters/writing-an-adapter)             |
| Queue consumers, workers, mixed processes | `transports`, `createApplication`                       | [Other transports](https://navios.tech/docs/server/guides/other-transports)                   |
| Coming from NestJS                        | the same vocabulary, listed differences                 | [Migrating from NestJS](https://navios.tech/docs/server/reference/migrating-from-nestjs)      |

Related packages: [`@navios/adapter-fastify`](https://navios.tech/docs/server/adapters/fastify), [`@navios/adapter-bun`](https://navios.tech/docs/server/adapters/bun), [`@navios/adapter-srvx`](https://navios.tech/docs/server/adapters/srvx), [`@navios/adapter-xml`](https://navios.tech/docs/server/adapters/xml), [`@navios/jwt`](https://navios.tech/docs/server/guides/authentication), [`@navios/schedule`](https://navios.tech/docs/server/guides/scheduled-jobs), [`@navios/openapi`](https://navios.tech/docs/server/guides/openapi) and [`@navios/otel`](https://navios.tech/docs/server/opentelemetry/).

## Entry points

| Import                         | Contents                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| `@navios/server`               | The framework, plus everything from `@navios/core`.                   |
| `@navios/server/adapter`       | The adapter contract, for adapter authors.                            |
| `@navios/server/web`           | CORS, body limit and `inject()` for adapters of web-standard servers. |
| `@navios/server/testing`       | `defineInMemoryEnvironment`, `createTestClient`.                      |
| `@navios/server/conformance`   | `runAdapterConformance`, for adapter authors.                         |
| `@navios/server/legacy-compat` | Decorators for `experimentalDecorators` projects.                     |

## Upgrading from 1.x

In 1.x this package was `@navios/core`; that name now belongs to the part that does not depend on HTTP. Adapters, request data, guards and error responses changed in 2.0 as well. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
