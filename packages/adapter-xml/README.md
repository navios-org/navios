# @navios/adapter-xml

Build XML responses (RSS and Atom feeds, sitemaps and the like) with JSX in a Navios application. The package is a JSX runtime, a renderer and a plugin; it works on every HTTP adapter with the same code.

## Features

- **JSX syntax** for XML, with TypeScript checking
- **`xml()` responses**: a handler returns `xml(<Feed />)` and the plugin renders it
- **Function components**, synchronous or asynchronous; siblings are resolved in parallel
- **Class components** built by the DI container, with `inject()` and validated props
- **Request context in components**: read request values and request-scoped services while rendering
- **Typed tags** with `defineTag` and any Standard Schema (Zod, Valibot, ArkType)
- **CDATA and raw XML** helpers, namespaced tags (`atom:link`)

## Installation

```bash
yarn add @navios/adapter-xml
```

`@navios/core` 2.x is a peer dependency.

## Setup

### TypeScript

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

### Plugin

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { xmlPlugin } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
  plugins: [xmlPlugin()],
})
await app.listen({ port: 3000 })
```

`xmlPlugin(options?)` takes defaults for every XML response of the application:

| Option        | Default             | Meaning                                                        |
| ------------- | ------------------- | -------------------------------------------------------------- |
| `contentType` | `'application/xml'` | Media type. `; charset=utf-8` is added when it has no charset. |
| `declaration` | `true`              | Write `<?xml version="1.0" encoding="..."?>` first.            |
| `encoding`    | `'UTF-8'`           | Encoding named in the declaration. The body is sent as UTF-8.  |
| `pretty`      | `false`             | Indent the output.                                             |

## Serving XML

Declare the endpoint with `response: 'text'` (`'stream'` and `'blob'` work too) and return `xml(tree, options?)` from its handler:

```tsx
import { xml } from '@navios/adapter-xml'
import { builder } from '@navios/builder'
import { Controller, Endpoint, inject } from '@navios/core'

const api = builder()

export const getFeed = api.declareEndpoint({
  method: 'GET',
  url: '/feed.xml',
  response: 'text',
})

@Controller()
export class FeedController {
  private readonly posts = inject(PostService)

  @Endpoint(getFeed)
  async feed() {
    const posts = await this.posts.latest()
    return xml(
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          {posts.map((post) => (
            <item>
              <title>{post.title}</title>
              <link>{post.url}</link>
            </item>
          ))}
        </channel>
      </rss>,
      { contentType: 'application/rss+xml' },
    )
  }
}
```

A handler that needs the request takes the usual parameters: `async feed(params: HandlerParams<typeof getFeed>, ctx: RequestContext)`.

`xml()` options are the plugin options plus `status` (default 200); they win over the plugin's defaults. Other response headers and cookies are set as usual with `ctx.reply.header()` and `ctx.reply.cookie()`.

How it works:

- `xml()` only wraps the tree: it returns core's `result('xml', ...)`, a result of the custom response kind `xml`. The plugin registers the encoder for that kind with `api.encoder('xml', ...)`. The encoder renders the tree after the handler returns, with the request context, and turns the result into a text response with the XML content type. Routes that return anything else are not touched by the plugin.
- The whole document is rendered before the response starts, whatever the declared response kind. The encoder runs inside the route pipeline, so an error thrown by a component is handled like an error thrown by the handler: an `HttpException` becomes its status, anything else a 500 problem response. A client never receives half a document.
- `xmlPlugin()` is required. Without it nothing encodes the `xml` kind and the adapter is handed the unrendered tree.

### Without the plugin

`renderToXml` returns a string, which a `response: 'text'` handler can return directly:

```tsx
@Endpoint(getFeed)
async feed(_params: HandlerParams<typeof getFeed>, ctx: RequestContext) {
  ctx.reply.header('content-type', 'application/rss+xml; charset=utf-8')
  return renderToXml(<Feed />, { ctx, container })
}
```

## Components

Components are not run when the JSX expression is evaluated. They run when the tree is rendered, top down, and siblings run in parallel.

### Function components

A function component receives its props and, as second argument, the `RequestContext` of the request being served. It may be asynchronous.

```tsx
import type { RequestContext } from '@navios/core'

async function LatestPosts({ limit }: { limit: number }, ctx: RequestContext) {
  const tenant = await ctx.get(CurrentTenant) // a request value
  const posts = await ctx.use(PostRepository).latest(tenant, limit) // a request-scoped service
  return (
    <>
      {posts.map((post) => (
        <item>
          <title>{post.title}</title>
        </item>
      ))}
    </>
  )
}

// usage
;<channel>
  <LatestPosts limit={10} />
</channel>
```

### Class components

A class component is registered with `@Component()` and implements `render(ctx)`. The DI container builds a new instance for every place the component appears in a tree:

- props are the constructor argument;
- field initialisers can `inject()` singletons;
- `render(ctx)` receives the `RequestContext`.

```tsx
import { Component } from '@navios/adapter-xml'
import { inject } from '@navios/core'

import type { XmlComponent } from '@navios/adapter-xml'
import type { RequestContext } from '@navios/core'

@Component()
class LatestPosts implements XmlComponent {
  private readonly posts = inject(PostService) // singleton

  async render(ctx: RequestContext) {
    const user = ctx.get(CurrentUser) // context key set by a guard
    const posts = await this.posts.latestFor(user)
    return (
      <>
        {posts.map((post) => (
          <item>
            <title>{post.title}</title>
          </item>
        ))}
      </>
    )
  }
}
```

With a props schema (any Standard Schema), the props are validated and the parsed value is passed to the constructor:

```tsx
const DescriptionSchema = z.object({
  content: z.string(),
  wrapInCData: z.boolean().optional(),
})

@Component({ schema: DescriptionSchema })
class Description implements XmlComponent {
  constructor(private readonly props: z.output<typeof DescriptionSchema>) {}

  render() {
    return (
      <description>
        {this.props.wrapInCData ? <CData>{this.props.content}</CData> : this.props.content}
      </description>
    )
  }
}

;<Description content="<p>Hello</p>" wrapInCData />
```

Without decorator syntax: `Component()(LatestPosts)` or `Component({ schema })(Description)`.

### Per-request data in components

Components are never request-scoped. A class component is a transient built against the root container, so `inject()` in it reaches singletons only; injecting a request-scoped service fails with a scope mismatch error. Everything that belongs to the request comes from `ctx`:

| Need                                            | Use                                             |
| ----------------------------------------------- | ----------------------------------------------- |
| A value a guard or interceptor stored           | `ctx.get(SomeContextKey)`                       |
| A value derived from the request, computed once | `ctx.get(SomeRequestValue)` (`@RequestValue()`) |
| A request-scoped service                        | `ctx.use(SomeScopedService)`                    |
| Headers, cookies, route                         | `ctx.headers`, `ctx.cookies`, `ctx.route`       |
| A singleton                                     | `inject()` in a class component                 |

When a tree is rendered outside a request (`renderToXml(tree)` without `ctx`), a component that uses `ctx` throws `MissingContextError`.

## Tags

Lower-case JSX tags are written as they are. `defineTag` creates a tag component, which is useful for namespaced names and for checking attributes:

```tsx
import { defineTag } from '@navios/adapter-xml'
import { z } from 'zod'

const AtomLink = defineTag(
  'atom:link',
  z.object({
    href: z.string().url(),
    rel: z.enum(['self', 'alternate']),
    type: z.string().optional(),
  }),
)

<AtomLink href="https://example.com/feed.xml" rel="self" type="application/rss+xml" />
```

The schema can be any Standard Schema that validates synchronously. Invalid attributes throw when the tag is rendered. The attributes are written as given; the schema's output is not used.

## CDATA and raw XML

```tsx
import { CData, DangerouslyInsertRawXml } from '@navios/adapter-xml'

<description>
  <CData>{'<p>HTML that must not be escaped</p>'}</CData>
</description>

<content>
  <DangerouslyInsertRawXml>{trustedXmlFragment}</DangerouslyInsertRawXml>
</content>
```

`CData` splits content that contains `]]>` into several sections. `DangerouslyInsertRawXml` writes its content without any escaping; use it only with content you trust.

## API reference

### `xmlPlugin(options?)`

Plugin that renders `xml()` values returned by handlers. Options: `contentType`, `declaration`, `encoding`, `pretty`.

### `xml(tree, options?)`

Wraps a tree as the response of a `response: 'text' | 'stream' | 'blob'` endpoint. Options: `contentType`, `declaration`, `encoding`, `pretty`, `status`. Returns an `XmlResponse` (a `CustomResult<'xml', XmlPayload>`); `isXmlResponse(value)` recognises one.

### `renderToXml(tree, options?)`

Renders a tree to a string.

| Option        | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `declaration` | Include the XML declaration (default `true`).                              |
| `encoding`    | Encoding named in the declaration (default `'UTF-8'`).                     |
| `pretty`      | Indent the output (default `false`).                                       |
| `container`   | DI container that builds class components. Required when the tree has any. |
| `ctx`         | `RequestContext` passed to components.                                     |

Throws `MissingContainerError` when the tree contains a class component and no container was given, and `MissingContextError` when a component uses a context that was not given.

### `Component(options?)`

Registers a class component. `options.schema` is a Standard Schema for the props.

### `XmlComponent`

```ts
interface XmlComponent {
  render(ctx: RequestContext): XmlRenderable | Promise<XmlRenderable>
}
```

### `defineTag(name, propsSchema?)`

Creates a tag component. `tagName` on the result is the name.

### `CData`, `DangerouslyInsertRawXml`, `Fragment`, `createElement`

The special nodes described above, the fragment symbol behind `<>...</>`, and the classic element factory for code that does not use JSX.

## Migrating from 1.x

| 1.x                                                                         | 2.0                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `adapter: [defineFastifyEnvironment(), defineXmlEnvironment()]`             | `adapter: defineFastifyEnvironment(), plugins: [xmlPlugin()]`                                                                |
| `declareXmlStream({ method, url, contentType, xmlDeclaration, encoding })`  | `builder().declareEndpoint({ method, url, response: 'text' })`; the XML options go to `xml()` or `xmlPlugin()`               |
| `@XmlStream(endpoint) async feed(params: XmlStreamParams<typeof endpoint>)` | `@Endpoint(endpoint) async feed(params: HandlerParams<typeof endpoint>, ctx: RequestContext)`                                |
| handler returns the JSX tree                                                | handler returns `xml(tree, { contentType })`                                                                                 |
| `xmlDeclaration: false`                                                     | `xml(tree, { declaration: false })`                                                                                          |
| `@HttpCode(201)` on an XML endpoint                                         | `xml(tree, { status: 201 })`                                                                                                 |
| `XmlStreamAdapterService`, core's `XmlStreamAdapterToken`                   | removed                                                                                                                      |
| `@Component({ registry })`                                                  | removed with DI registries                                                                                                   |
| component class is request-scoped and injects request-scoped services       | component is transient; `inject()` reaches singletons, request data comes from `render(ctx)`: `ctx.get(...)`, `ctx.use(...)` |
| `render()`                                                                  | `render(ctx: RequestContext)`; a `render()` without the parameter still works                                                |
| function components run while the JSX expression is evaluated               | they run when the tree is rendered and receive `ctx` as second argument                                                      |
| `defineTag(name, zodObject)`, `@Component({ schema: zodObject })`           | unchanged for Zod; any Standard Schema is accepted. `zod` is no longer a dependency of this package                          |
| `renderToXml(tree, { container: container.beginRequest(id) })`              | `renderToXml(tree, { container, ctx? })`                                                                                     |

There is no deprecated `@XmlStream` alias. The 1.x decorator took its XML options from a `declareXmlStream` declaration, which has no equivalent in a builder declaration, so an alias would have needed a second declaration format next to the builder's.

The 1.x content type was sent exactly as configured; 2.0 adds `; charset=utf-8`.

## License

MIT
