# @navios/adapter-xml

Build XML responses, such as RSS and Atom feeds or sitemaps, with JSX in a [Navios](https://navios.tech) application. Despite its name it is not an HTTP adapter: it is a JSX runtime, a renderer and a plugin, and it works with the same code on every adapter: Fastify, Bun and srvx.

**[Documentation](https://navios.tech/docs/server/adapters/xml)** · [Server quick start](https://navios.tech/docs/server/quick-start)

## Install

```bash
npm install @navios/adapter-xml@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/server` and `@navios/core` of the same version are peer dependencies. Point TypeScript's JSX transform at the package, and write JSX in `.tsx` files:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

## Example

```tsx
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { xml, xmlPlugin } from '@navios/adapter-xml'
import { builder } from '@navios/builder'
import { Controller, Endpoint, Module, NaviosFactory } from '@navios/server'

const API = builder()

export const getFeed = API.declareEndpoint({
  method: 'GET',
  url: '/feed.xml',
  response: 'text',
})

const posts = [{ title: 'Hello', url: 'https://example.com/hello' }]

@Controller()
class FeedController {
  @Endpoint(getFeed)
  async feed() {
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

@Module({ controllers: [FeedController] })
class AppModule {}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [xmlPlugin()],
})

await app.listen({ port: 3000 })
```

`xml()` only wraps the tree. The plugin renders it after the handler returns, with the request context, and sends it with the XML content type. The whole document is rendered before the response starts, so an error thrown by a component becomes an ordinary error response and a client never receives half a document. `xmlPlugin()` is required for `xml()` to work.

## What else it does

| Need                                       | How                                             | Docs                                                                                                          |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Content type, declaration, indentation     | `xmlPlugin(options)`, `xml(tree, options)`      | [Setup](https://navios.tech/docs/server/adapters/xml#setup)                                                   |
| Another status                             | `xml(tree, { status: 201 })`                    | [Serving XML](https://navios.tech/docs/server/adapters/xml#serving-xml)                                       |
| Asynchronous components                    | `async function Latest(props, ctx)`             | [Function components](https://navios.tech/docs/server/adapters/xml#function-components)                       |
| Components with injected services          | `@Component()`, `render(ctx)`, a props `schema` | [Class components](https://navios.tech/docs/server/adapters/xml#class-components)                             |
| Request data while rendering               | `ctx.get()`, `ctx.use()`, `ctx.headers`         | [Per-request data in components](https://navios.tech/docs/server/adapters/xml#per-request-data-in-components) |
| Namespaced tags, checked attributes        | `defineTag('atom:link', schema)`                | [Tags](https://navios.tech/docs/server/adapters/xml#tags)                                                     |
| Unescaped content                          | `<CData>`, `<DangerouslyInsertRawXml>`          | [CDATA and raw XML](https://navios.tech/docs/server/adapters/xml#cdata-and-raw-xml)                           |
| A string instead of a response             | `renderToXml(tree, { container, ctx })`         | [Rendering outside a request](https://navios.tech/docs/server/adapters/xml#rendering-outside-a-request)       |
| Rendering in a handler, without the plugin | `renderToXml` in a `response: 'text'` handler   | [Without the plugin](https://navios.tech/docs/server/adapters/xml#without-the-plugin)                         |
| Code that does not use JSX                 | `createElement`, `Fragment`                     | [Other exports](https://navios.tech/docs/server/adapters/xml#other-exports)                                   |

## Upgrading from 1.x

`defineXmlEnvironment`, `declareXmlStream` and `@XmlStream` are replaced by `xmlPlugin()`, an ordinary `response: 'text'` endpoint and `xml()`. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
