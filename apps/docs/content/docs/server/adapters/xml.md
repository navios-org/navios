---
title: XML responses
---

# XML responses

`@navios/adapter-xml` builds XML responses, such as RSS and Atom feeds or sitemaps, with JSX. Despite its name it is not an HTTP adapter: it is a JSX runtime, a renderer and a plugin, and it works with the same code on Fastify and on Bun.

## Setup

```bash
yarn add @navios/adapter-xml
```

Point TypeScript's JSX transform at the package. Files that contain JSX use the `.tsx` extension.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

Then add the plugin:

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { xmlPlugin } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [xmlPlugin()],
})
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

```tsx title="feed.controller.tsx"
import { xml } from '@navios/adapter-xml'
import { Controller, Endpoint, inject } from '@navios/core'

import { API } from './api.mjs'
import { PostsService } from './posts.service.mjs'

export const getFeed = API.declareEndpoint({
  method: 'GET',
  url: '/feed.xml',
  response: 'text',
})

@Controller()
export class FeedController {
  private readonly posts = inject(PostsService)

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

The options of `xml()` are the plugin options plus `status` (default 200), and they win over the plugin's defaults. Other response headers and cookies are set as usual with `ctx.reply.header()` and `ctx.reply.cookie()`.

What happens to the returned value:

- `xml()` only wraps the tree. The plugin registers a [response encoder](/docs/server/guides/plugins) that renders it after the handler returns, with the request context, and sends the result as text with the XML content type. Routes that return anything else are not touched.
- The whole document is rendered before the response starts, whatever the declared response kind, so a client never receives half a document.
- An error thrown by a component is handled like an error thrown by the handler: an `HttpException` becomes its status, anything else a 500 problem response. See [Errors](/docs/server/essentials/errors).

:::warning
`xmlPlugin()` is required. Without it nothing renders the value `xml()` returns, and the adapter is handed the unrendered tree.
:::

## Components

Components are not run when the JSX expression is evaluated. They run when the tree is rendered, top down, and siblings run in parallel.

### Function components

A function component receives its props and, as second argument, the `RequestContext` of the request being served. It may be asynchronous.

```tsx
import type { RequestContext } from '@navios/core'

async function LatestPosts({ limit }: { limit: number }, ctx: RequestContext) {
  const tenant = ctx.get(CurrentTenant) // a context key or request value
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

const tree = (
  <channel>
    <LatestPosts limit={10} />
  </channel>
)
```

### Class components

A class component is registered with `@Component()` and implements `render(ctx)`. The DI container builds a new instance for every place the component appears in a tree. Props are the constructor argument, field initialisers can `inject()` singletons, and `render(ctx)` receives the `RequestContext`.

```tsx
import { Component } from '@navios/adapter-xml'
import { inject } from '@navios/core'

import type { XmlComponent } from '@navios/adapter-xml'
import type { RequestContext } from '@navios/core'

@Component()
class LatestPosts implements XmlComponent {
  private readonly posts = inject(PostsService)

  async render(ctx: RequestContext) {
    const posts = await this.posts.latestFor(ctx.get(CurrentUser))
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

With a props schema (any Standard Schema), the props are validated when the component is built and the parsed value is passed to the constructor:

```tsx
import { CData, Component } from '@navios/adapter-xml'
import { z } from 'zod/v4'

const descriptionSchema = z.object({
  content: z.string(),
  wrapInCData: z.boolean().optional(),
})

@Component({ schema: descriptionSchema })
class Description implements XmlComponent {
  constructor(private readonly props: z.output<typeof descriptionSchema>) {}

  render() {
    return (
      <description>
        {this.props.wrapInCData ? <CData>{this.props.content}</CData> : this.props.content}
      </description>
    )
  }
}

const tree = <Description content="<p>Hello</p>" wrapInCData />
```

A class can be registered without decorator syntax: `Component()(LatestPosts)` or `Component({ schema })(Description)`.

### Per-request data in components

Components are never request-scoped. A class component is a transient built against the root container, so `inject()` in it reaches singletons only, and injecting a request-scoped service fails with a scope mismatch error. Everything that belongs to the request comes from `ctx`:

| Need                                            | Use                                             |
| ----------------------------------------------- | ----------------------------------------------- |
| A value a guard or interceptor stored           | `ctx.get(SomeContextKey)`                       |
| A value derived from the request, computed once | `ctx.get(SomeRequestValue)` (`@RequestValue()`) |
| A request-scoped service                        | `ctx.use(SomeScopedService)`                    |
| Headers, cookies, route                         | `ctx.headers`, `ctx.cookies`, `ctx.route`       |
| A singleton                                     | `inject()` in a class component                 |

[Per-request state](/docs/server/guides/request-state) explains context keys, request values and `ctx.use`.

## Tags

Lower-case JSX tags are written as they are, with any attributes. `defineTag` creates a tag component, which is useful for namespaced names and for checking attributes:

```tsx
import { defineTag } from '@navios/adapter-xml'
import { z } from 'zod/v4'

const AtomLink = defineTag(
  'atom:link',
  z.object({
    href: z.url(),
    rel: z.enum(['self', 'alternate']),
    type: z.string().optional(),
  }),
)

const link = <AtomLink href="https://example.com/feed.xml" rel="self" type="application/rss+xml" />
```

The schema can be any Standard Schema that validates synchronously. Invalid attributes throw when the tag is rendered, with an error naming the tag and the attribute. The attributes are written as given; the schema's output is not used.

## CDATA and raw XML

```tsx
import { CData, DangerouslyInsertRawXml } from '@navios/adapter-xml'

const item = (
  <item>
    <description>
      <CData>{'<p>HTML that must not be escaped</p>'}</CData>
    </description>
    <content>
      <DangerouslyInsertRawXml>{trustedXmlFragment}</DangerouslyInsertRawXml>
    </content>
  </item>
)
```

Text and attribute values are escaped by the renderer. `CData` writes its content in a CDATA section and splits content that contains `]]>` into several sections.

:::danger
`DangerouslyInsertRawXml` writes its content without any escaping. Use it only with content you trust.
:::

## Rendering outside a request

`renderToXml(tree, options?)` renders a tree to a string, for a job that writes a sitemap to disk or for a test.

```tsx
import { renderToXml } from '@navios/adapter-xml'

const sitemap = await renderToXml(<Sitemap />, { container: app.container, pretty: true })
```

The options are `declaration`, `encoding` and `pretty`, as for the plugin, plus `container`, the DI container that builds class components, and `ctx`, the `RequestContext` passed to components.

It throws `MissingContainerError` when the tree contains a class component and no container was given, and `MissingContextError` when a component uses a context that was not given.
