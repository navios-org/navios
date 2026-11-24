---
title: OpenAPI
---

# OpenAPI

`@navios/openapi` is a plugin that builds an OpenAPI 3.1 document from the application's routes and serves it as JSON, optionally as YAML, together with a [Scalar](https://scalar.com) API reference page. The endpoint declarations already say what each route accepts and returns, so most of the document needs no extra code.

The plugin's routes are ordinary Navios routes, so it works the same on every adapter.

```bash
npm install @navios/openapi
```

## Adding the plugin

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'
import { openApiPlugin } from '@navios/openapi'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [
    openApiPlugin({
      info: { title: 'Users API', version: '1.0.0' },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      security: [{ bearerAuth: [] }],
    }),
  ],
})

await app.listen({ port: 3000 })
// GET /docs          the Scalar page
// GET /openapi.json  the document
```

The document is built once, while the application initialises, from `app.routes()`. It contains every route, including those added by other plugins, whether the handler is an `@Endpoint` method or a `handler()` field.

Paths in the document are full route paths, with the global prefix and module prefixes. The plugin's own routes get the global prefix too (`/api/docs` with `globalPrefix: '/api'`) and are left out of the document.

## What is documented

For each route, from its declaration:

| Declaration                              | In the document                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `url: '/users/$userId'`                  | Path `/users/{userId}` and a required `path` parameter                                  |
| `querySchema`                            | One `query` parameter per property                                                      |
| `requestSchema`                          | An `application/json` request body                                                      |
| `body: 'multipart'`                      | A `multipart/form-data` request body; file fields are binary strings                    |
| `responseSchema`                         | `200` with an `application/json` body                                                   |
| `responses: { 201: schema, 204: null }`  | One response per status; `null` means no content                                        |
| `response: 'void'`                       | `204` without content                                                                   |
| `response: 'stream' \| 'blob' \| 'text'` | `200` with `application/octet-stream` (`text/plain` for text), or what `ApiStream` says |
| `errorSchema: { 404: schema }`           | One error response per status                                                           |

## Schemas

Declarations hold Standard Schemas, and OpenAPI needs JSON Schema. The plugin gets it in this order:

1. From the schema itself, when the library implements the Standard JSON Schema extension. Zod 4 and ArkType do, so they need no configuration.
2. From the `toJsonSchema` option, for libraries that do not:

   ```ts
   import { toJsonSchema } from '@valibot/to-json-schema'

   openApiPlugin({
     info,
     toJsonSchema: (schema, io) => toJsonSchema(schema as never, { typeMode: io }),
   })
   ```

   `io` is `'input'` for request parts and `'output'` for responses. Return `undefined` for a schema the converter does not know.

3. Otherwise the part is documented as an unconstrained schema, and one warning naming the endpoint is logged during `init()`.

Descriptions and examples come from whatever the library puts into its JSON Schema. With Zod that is `.meta()`:

```ts
const userSchema = z
  .object({
    id: z.string().meta({ description: 'Unique identifier', example: 'usr_123' }),
    name: z.string(),
    email: z.email(),
  })
  .meta({ id: 'User' })
```

A schema with an `id` becomes a shared entry in `components.schemas`, and every use of it is a reference:

```json
{
  "200": {
    "description": "Successful response",
    "content": {
      "application/json": { "schema": { "$ref": "#/components/schemas/User" } }
    }
  }
}
```

Types that JSON Schema cannot express, such as `z.date()`, `z.instanceof(File)` and `z.custom()`, are documented as unconstrained instead of failing. In a multipart body an unconstrained field is taken to be a file, which is how `z.instanceof(File)` and arrays of it end up documented as uploads.

## Attributes

What a declaration cannot say (tags, summaries, security) is added with [attributes](/docs/server/guides/attributes). Each is a decorator for a handler, a controller or a module.

```ts title="users.controller.mts"
import { Controller, Endpoint, inject, reply } from '@navios/core'
import { ApiOperation, ApiSummary, ApiTag } from '@navios/openapi'

import type { HandlerParams } from '@navios/core'

import { createUser, getUser } from './users.mjs'
import { UsersService } from './users.service.mjs'

@ApiTag('Users', 'Accounts and profiles')
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @ApiSummary('Get a user by id')
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  }

  @ApiOperation({
    summary: 'Create a user',
    description: 'The email address must be unique.',
    operationId: 'createUser',
  })
  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, this.users.create(data))
  }
}
```

| Attribute                                  | Effect                                                                              | Read from                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ApiTag(name, description?)`               | Adds a tag                                                                          | Module, controller and handler, combined         |
| `ApiSummary(text)`                         | The operation's summary                                                             | Handler                                          |
| `ApiOperation({ ... })`                    | `summary`, `description`, `operationId`, `deprecated`, `externalDocs`. Its `summary` wins over `ApiSummary` | Handler                  |
| `ApiDeprecated()`                          | Marks operations as deprecated                                                      | The most specific of handler, controller, module |
| `ApiSecurity({ scheme: scopes })`          | The security requirement, replacing the plugin's `security` default                 | The most specific of handler, controller, module |
| `ApiExclude()`                             | Leaves operations out of the document                                               | Handler, controller or module                    |
| `ApiStream({ contentType, description? })` | Content type of a `stream`, `blob` or `text` response                               | Handler                                          |

Three uses worth knowing:

```ts
// On a handler that needs no token, when the default requirement is bearerAuth
@ApiSecurity({})
@Endpoint(login)

// On a handler that serves server-sent events
@ApiStream({ contentType: 'text/event-stream', description: 'User changes of one team' })
@Endpoint(teamEvents)

// On a controller or a module with internal routes
@ApiExclude()
@Controller()
```

The attributes only describe. `ApiSecurity` does not protect a route; a [guard](/docs/server/essentials/guards-and-interceptors) does. An `operationId` is present only when you set one.

With `handler()` fields, pass the values in the options: `handler(createUser, { attributes: [ApiSummary('Create a user')] }, fn)`. Projects compiled with `experimentalDecorators` import the attributes from `@navios/openapi/legacy-compat`.

## Options

| Option              | Default           | Meaning                                                                               |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `info`              | required          | `title`, `version`, and optionally `summary`, `description`, `termsOfService`, `contact`, `license` |
| `servers`           |                   | Server list. Paths already contain the global prefix, so list origins only            |
| `externalDocs`      |                   | Link to external documentation                                                        |
| `securitySchemes`   |                   | Placed in `components.securitySchemes`                                                |
| `security`          |                   | Security requirements of every operation that does not set its own                    |
| `tags`              |                   | Tag definitions. Tags used by routes are added to these                               |
| `jsonPath`          | `'/openapi.json'` | Path of the JSON document                                                             |
| `yamlPath`          | `'/openapi.yaml'` | Path of the YAML document                                                             |
| `docsPath`          | `'/docs'`         | Path of the Scalar page                                                               |
| `disableJson`       | `false`           | Do not serve JSON. The Scalar page then embeds the document                           |
| `disableYaml`       | `true`            | YAML is served only when this is `false`                                              |
| `disableScalar`     | `false`           | Do not serve the Scalar page                                                          |
| `scalar`            |                   | `theme`, `favicon`, `customCss`, `hideDownloadButton`, `hideSearch`, `metaData`, `cdn` |
| `toJsonSchema`      |                   | Converter for schema libraries without the JSON Schema extension                      |
| `transformDocument` |                   | `(document, routes) => document \| void`. Called once with the generated document before it is served |

`transformDocument` is the place for anything the options do not cover. Mutate the document or return a new one: `transformDocument(document) { document.info.description = buildInfo }`.

To keep the documentation out of production, leave the plugin out of `plugins` there.

## Generating the document without serving it

`generateOpenApiDocument` builds the same document from a route list. Use it to write the file in a build step, for a client generator or a contract check in CI:

```ts title="scripts/openapi.mts"
const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(), // from '@navios/core/testing'
  logger: false,
})
await app.init()

const document = generateOpenApiDocument(app.routes(), {
  info: { title: 'Users API', version: '1.0.0' },
})
await writeFile('openapi.json', JSON.stringify(document, null, 2))

await app.close()
```

The in-memory adapter opens no port, so the script needs nothing but the application's modules.

`@navios/openapi-fastify` and `@navios/openapi-bun` are deprecated packages that re-export `@navios/openapi`; import from `@navios/openapi` directly.
