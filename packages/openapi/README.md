# @navios/openapi

OpenAPI 3.1 documentation for Navios applications: one plugin that builds the document from the application's routes and serves it as JSON, optionally as YAML, with a [Scalar](https://scalar.com) API reference page.

It works with every adapter (Fastify, Bun, the in-memory test adapter), because the routes it adds are ordinary Navios routes. `@navios/openapi-fastify` and `@navios/openapi-bun` are deprecated re-exports of this package.

## Installation

```bash
yarn add @navios/openapi
```

`@navios/core` is a peer dependency. No schema library is required at runtime.

## Usage

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'
import { openApiPlugin } from '@navios/openapi'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [
    openApiPlugin({
      info: { title: 'My API', version: '1.0.0' },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      scalar: { theme: 'purple' },
    }),
  ],
})

await app.listen({ port: 3000 })
// GET /docs          Scalar API reference
// GET /openapi.json  the document
```

`app.usePlugin(openApiPlugin({ ... }))` before `init()` does the same.

The document is built once, while the application initialises, from `app.routes()`. It therefore contains every route, including those contributed by other plugins, in both handler forms (`@Endpoint` methods and `handler()` fields). Paths are the full route paths: the global prefix and module prefixes are part of them.

The plugin's own routes get the application's global prefix as well (`/api/docs` with `globalPrefix: '/api'`) and are not part of the document.

### Options

| Option              | Default           | Meaning                                                                                                |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `info`              | required          | `title`, `version`, `description`, `termsOfService`, `contact`, `license`.                             |
| `servers`           |                   | Server list.                                                                                           |
| `externalDocs`      |                   | Link to external documentation.                                                                        |
| `securitySchemes`   |                   | Placed in `components.securitySchemes`.                                                                |
| `security`          |                   | Security requirements of every operation that does not set its own.                                    |
| `tags`              |                   | Tag definitions. Tags used by routes are added to these.                                               |
| `jsonPath`          | `'/openapi.json'` | Path of the JSON document.                                                                             |
| `yamlPath`          | `'/openapi.yaml'` | Path of the YAML document.                                                                             |
| `docsPath`          | `'/docs'`         | Path of the Scalar page.                                                                               |
| `disableJson`       | `false`           | Do not serve JSON. The Scalar page then embeds the document.                                           |
| `disableYaml`       | `true`            | YAML is off unless this is `false`.                                                                    |
| `disableScalar`     | `false`           | Do not serve the Scalar page.                                                                          |
| `scalar`            |                   | `theme`, `favicon`, `customCss`, `hideDownloadButton`, `hideSearch`, `metaData`, `cdn`.                |
| `toJsonSchema`      |                   | Converter for schema libraries without the Standard JSON Schema extension. See [Schemas](#schemas).    |
| `transformDocument` |                   | `(document, routes) => document \| void`. Called once with the generated document before it is served. |

### Without the plugin

```ts
import { generateOpenApiDocument } from '@navios/openapi'

await app.init()
const document = generateOpenApiDocument(app.routes(), {
  info: { title: 'My API', version: '1.0.0' },
})
```

This is useful for writing the document to a file in a build step.

## What is documented

For each route, from its endpoint declaration:

| Declaration                              | Document                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `url: '/users/$id'`                      | Path `/users/{id}` and a required `path` parameter (a string, or its `urlParamsSchema` entry). |
| `querySchema`                            | One `query` parameter per property.                                                            |
| `headersSchema`, `cookiesSchema`         | `header` and `cookie` parameters.                                                              |
| `requestSchema`                          | `application/json` request body.                                                               |
| `body: 'multipart'`                      | `multipart/form-data` request body; file fields are binary strings.                            |
| `responseSchema`                         | `200` with an `application/json` body.                                                         |
| `responses: { 201: schema, 204: null }`  | One response per status; `null` means no content.                                              |
| `response: 'void'`                       | `204` without content.                                                                         |
| `response: 'stream' \| 'blob' \| 'text'` | `200` with `application/octet-stream` (`text/plain` for text), or what `ApiStream` says.       |
| `errorSchema: { 404: schema }`           | One error response per status.                                                                 |

## Attributes

Each attribute is a decorator for a module, a controller, a handler method or a `handler()` field, and a value for `handler()` options.

```ts
import { Controller, handler } from '@navios/core'
import { ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

@ApiTag('Users', 'User management')
@Controller()
export class UsersController {
  @ApiSummary('Get a user')
  getUser = handler(getUser, ({ urlParams }) => this.users.find(urlParams.id))

  createUser = handler(
    createUser,
    { attributes: [ApiOperation({ summary: 'Create a user' }), ApiSecurity({ bearerAuth: [] })] },
    ({ data }) => reply(201, this.users.create(data)),
  )
}
```

On a class, place attributes above `@Controller` / `@Module`.

| Attribute                                  | Effect                                                                                   | Read from                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ApiTag(name, description?)`               | Adds a tag.                                                                              | Module, controller and handler, combined.         |
| `ApiOperation({ ... })`                    | `summary`, `description`, `operationId`, `deprecated`, `externalDocs`.                   | Handler.                                          |
| `ApiSummary(text)`                         | Shorthand for `ApiOperation({ summary })`; `ApiOperation`'s summary wins.                | Handler.                                          |
| `ApiDeprecated(message?)`                  | Marks operations as deprecated.                                                          | The most specific of handler, controller, module. |
| `ApiSecurity({ scheme: scopes })`          | Security requirement.                                                                    | The most specific of handler, controller, module. |
| `ApiExclude()`                             | Leaves operations out of the document.                                                   | Handler, controller or module.                    |
| `ApiStream({ contentType, description? })` | Content type of a `stream`, `blob` or `text` response (for example `text/event-stream`). | Handler.                                          |

`extractOpenApiMetadata(route)` returns what the attributes say about a `RouteInfo` (`ctx.route` or an entry of `app.routes()`).

Projects compiled with `experimentalDecorators` import the attributes from `@navios/openapi/legacy-compat`.

## Schemas

Endpoint schemas are Standard Schemas, and OpenAPI needs JSON Schema. The plugin gets it in this order:

1. **The Standard JSON Schema extension.** When the schema has `~standard.jsonSchema`, the plugin calls `jsonSchema.input(...)` for request slots and `jsonSchema.output(...)` for responses, with target `draft-2020-12` (the dialect of OpenAPI 3.1). Zod 4 and ArkType implement it, so they need no configuration.
2. **The `toJsonSchema` option**, for libraries that do not (Valibot, for example):

   ```ts
   import { toJsonSchema } from '@valibot/to-json-schema'

   openApiPlugin({
     info,
     toJsonSchema: (schema, io) => toJsonSchema(schema as never, { typeMode: io }),
   })
   ```

   `io` is `'input'` for request slots and `'output'` for responses. Return `undefined` for a schema the converter does not know.

3. **Neither:** the slot is documented as an unconstrained schema (`{}`) and one warning naming the endpoint is logged during `init()`.

What the plugin does with the result:

- `$schema` is removed, `$defs` move to `components.schemas` and references point there. With Zod, a schema with `.meta({ id: 'User' })` becomes a shared component.
- Types a library cannot express are requested as unconstrained schemas rather than errors (`z.date()`, `z.instanceof(File)`, `z.custom()`).
- In a `multipart` body, a field with an unconstrained schema is documented as a binary string, and an array of them as an array of binary strings. So `z.instanceof(File)` and `z.array(z.instanceof(File))` are documented as uploads.

Schema metadata is whatever the library puts in its JSON Schema. With Zod:

```ts
const userSchema = z.object({
  id: z.string().meta({ description: 'Unique identifier', example: 'usr_123' }),
})
```

The `zod-openapi` form, `.meta({ openapi: { description } })`, is still understood: the keys under `openapi` are merged into the schema.

## API

- `openApiPlugin(options)`: the plugin. `defineOpenApiPlugin` is its deprecated name.
- `generateOpenApiDocument(routes, options)`: builds the document from `RouteInfo[]`.
- `extractOpenApiMetadata(route)`: reads the attributes of a route.
- `SchemaConverter`, `describeMultipartFields`, `toOpenApiPath`, `extractUrlParamNames`: the building blocks.
- Attributes and their tokens (`ApiTagToken`, ...).
- Types: `OpenApiPluginOptions`, `OpenApiDocumentOptions`, `OpenApiDocument` and the other document types, `OpenApiEndpointMetadata`, `ToJsonSchema`, `ScalarOptions`.

## Migrating from 1.x

| 1.x                                                                                                                             | 2.0                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `defineOpenApiPlugin` from `@navios/openapi-fastify` / `@navios/openapi-bun`                                                    | `openApiPlugin` from `@navios/openapi`                                                            |
| Fastify: `/docs` ignored the global prefix                                                                                      | The plugin's routes get the global prefix on every adapter.                                       |
| `servers` defaulted to the global prefix                                                                                        | Paths contain the prefix; `servers` is only what you configure.                                   |
| `OpenApiGeneratorService`, `EndpointScannerService`, `PathBuilderService`, `MetadataExtractorService`, `SchemaConverterService` | `generateOpenApiDocument`, `extractOpenApiMetadata`, `SchemaConverter`                            |
| `@Stream` + `@ApiStream`, `@Multipart`, `@HttpCode`                                                                             | The declaration decides: `response: 'stream'`, `body: 'multipart'`, `responses: { 201: schema }`. |
| Zod only, through `zod-openapi`                                                                                                 | Any Standard Schema; see [Schemas](#schemas).                                                     |
| Option schemas (`scalarOptionsSchema`, ...)                                                                                     | Removed; options are plain TypeScript types.                                                      |

## Examples

[examples/openapi](../../examples/openapi) runs the same application on Fastify and on Bun.
