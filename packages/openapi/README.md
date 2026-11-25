# @navios/openapi

OpenAPI 3.1 documentation for [Navios](https://navios.tech) applications. One plugin builds the document from the application's routes and serves it as JSON, optionally as YAML, with a [Scalar](https://scalar.com) API reference page. The endpoint declarations already say what each route accepts and returns, so most of the document needs no extra code.

**[Documentation](https://navios.tech/docs/server/guides/openapi)**

## Install

```bash
npm install @navios/openapi@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/server` is a peer dependency. The plugin's routes are ordinary Navios routes, so it works the same on every adapter. The example also uses `@navios/adapter-fastify`, `@navios/builder` and `zod`.

## Example

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import { ApiSummary, ApiTag, openApiPlugin } from '@navios/openapi'
import { Controller, Endpoint, Module, NaviosFactory, reply } from '@navios/server'
import { z } from 'zod/v4'

import type { HandlerParams } from '@navios/server'

const API = builder()

const userSchema = z.object({ id: z.string(), name: z.string() }).meta({ id: 'User' }) // a shared entry in components.schemas

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

@ApiTag('Users', 'Accounts and profiles')
@Controller()
class UsersController {
  @ApiSummary('Get a user by id')
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    if (urlParams.userId !== '1') {
      return reply(404, { message: 'User not found' })
    }
    return { id: '1', name: 'Ada' }
  }
}

@Module({ controllers: [UsersController] })
class AppModule {}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [openApiPlugin({ info: { title: 'Users API', version: '1.0.0' } })],
})

await app.listen({ port: 3000 })
// GET /docs          the Scalar page
// GET /openapi.json  the document
```

The document is built once, while the application initialises, and contains every route, including those added by other plugins. Paths, parameters, request bodies, responses per status and error bodies come from the declarations.

## What else it does

| Need                                         | How                                                                                               | Docs                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| See what a declaration turns into            | `querySchema`, `responses`, `body: 'multipart'`, `response: 'stream'`, ...                        | [What is documented](https://navios.tech/docs/server/guides/openapi#what-is-documented)                                                 |
| Zod, ArkType, Valibot or another library     | Standard JSON Schema, or the `toJsonSchema` option                                                | [Schemas](https://navios.tech/docs/server/guides/openapi#schemas)                                                                       |
| Tags, summaries, security, exclusions        | `ApiTag`, `ApiSummary`, `ApiOperation`, `ApiSecurity`, `ApiDeprecated`, `ApiExclude`, `ApiStream` | [Attributes](https://navios.tech/docs/server/guides/openapi#attributes)                                                                 |
| Paths, YAML, the Scalar theme, final edits   | `jsonPath`, `disableYaml`, `scalar`, `transformDocument`, ...                                     | [Options](https://navios.tech/docs/server/guides/openapi#options)                                                                       |
| Write the document to a file in a build step | `generateOpenApiDocument(app.routes(), options)`                                                  | [Generating the document without serving it](https://navios.tech/docs/server/guides/openapi#generating-the-document-without-serving-it) |
| The building blocks                          | `extractOpenApiMetadata`, `SchemaConverter`, the attribute tokens                                 | [Other exports](https://navios.tech/docs/server/guides/openapi#other-exports)                                                           |

The attributes only describe: `ApiSecurity` does not protect a route, a guard does. Projects that keep `experimentalDecorators` on import the attributes from `@navios/openapi/legacy-compat`; see [Legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators).

[examples/openapi](../../examples/openapi) runs one application on Fastify and on Bun.

## Upgrading from 1.x

`openApiPlugin` from this package replaces `defineOpenApiPlugin` from `@navios/openapi-fastify` and `@navios/openapi-bun`, which are now deprecated re-exports, and any Standard Schema library works instead of Zod only. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosopenapi), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
