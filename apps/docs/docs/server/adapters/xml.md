---
sidebar_position: 3
title: XML
---

# XML Adapter

`@navios/adapter-xml` is an **extension adapter** that adds JSX-based XML rendering capabilities to your Navios application. Unlike the Fastify and Bun adapters which are standalone HTTP servers, the XML adapter works **alongside** your primary adapter to enable XML response generation.

**Package:** `@navios/adapter-xml`
**License:** MIT
**Requires:** `@navios/adapter-fastify` or `@navios/adapter-bun`

## When to Use

The XML adapter is designed for generating structured XML responses that follow specific formats and schemas. Common use cases include:

- **RSS Feeds** - Syndication feeds for blogs, news sites, and podcasts (`application/rss+xml`)
- **Atom Feeds** - Modern alternative to RSS with richer metadata (`application/atom+xml`)
- **Sitemaps** - XML sitemaps for search engine optimization
- **OPDS Catalogs** - Open Publication Distribution System for e-book catalogs
- **Custom XML APIs** - Any application requiring XML responses instead of JSON

The adapter leverages JSX syntax to make XML generation feel natural and type-safe, while supporting async data fetching, dependency injection, and proper XML escaping.

## Installation

```bash
npm install @navios/adapter-xml
# or
bun add @navios/adapter-xml
```

## How It Works

The XML adapter extends your existing HTTP adapter (Fastify or Bun) by registering additional services that handle XML rendering. You combine environments using an array in the `adapter` option:

```typescript
import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineXmlEnvironment } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
  adapter: [defineFastifyEnvironment(), defineXmlEnvironment()],
})

await app.init()
await app.listen({ port: 3000 })
```

This pattern works identically with the Bun adapter - simply replace `defineFastifyEnvironment()` with `defineBunEnvironment()`.

## TypeScript Configuration

Configure your `tsconfig.json` to use the XML adapter's JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

This enables writing XML using JSX syntax in `.tsx` files with full TypeScript type checking.

## Defining XML Endpoints

XML endpoints are declared using `declareXmlStream()` and handled with the `@XmlStream()` decorator. Unlike regular JSON endpoints, XML endpoints return JSX that gets rendered to XML strings.

```tsx
import { Controller } from '@navios/core'
import { XmlStream, declareXmlStream } from '@navios/adapter-xml'

const getRssFeed = declareXmlStream({
  method: 'GET',
  url: '/feed.xml',
  contentType: 'application/rss+xml',
})

@Controller()
class FeedController {
  @XmlStream(getRssFeed)
  async getFeed() {
    return (
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
        </channel>
      </rss>
    )
  }
}
```

The endpoint configuration supports several content types:

- `application/xml` (default)
- `text/xml`
- `application/rss+xml`
- `application/atom+xml`

You can also control XML declaration generation with `xmlDeclaration` (default: `true`) and encoding with `encoding` (default: `'UTF-8'`).

## Component Types

The XML adapter supports three types of components for building XML responses:

### Intrinsic Elements (JSX Tags)

Any lowercase JSX tag becomes an XML element. This is the simplest approach and works well for straightforward XML structures:

```tsx
<channel>
  <title>My Blog</title>
  <link>https://example.com</link>
</channel>
```

### Async Function Components

Function components can be async, allowing you to fetch data during rendering. Multiple async components are resolved in parallel for better performance:

```tsx
async function PostItem({ postId }: { postId: string }) {
  const post = await fetchPostById(postId)
  return (
    <item>
      <title>{post.title}</title>
      <link>{post.url}</link>
    </item>
  )
}

// Usage - all PostItem components render in parallel
;<channel>
  {postIds.map((id) => (
    <PostItem postId={id} />
  ))}
</channel>
```

### Class Components with Dependency Injection

For components that need access to services, use the `@Component()` decorator. Class components integrate with Navios dependency injection, allowing you to inject services, access request-scoped data, and build testable components:

```tsx
import { Component, XmlComponent } from '@navios/adapter-xml'
import { inject, Injectable, InjectableScope } from '@navios/core'

@Injectable()
class PostService {
  async getLatestPosts() {
    return [{ title: 'Hello', url: '/hello' }]
  }
}

@Component()
class LatestPosts implements XmlComponent {
  private readonly postService = inject(PostService)

  async render() {
    const posts = await this.postService.getLatestPosts()
    return (
      <>
        {posts.map((post) => (
          <item>
            <title>{post.title}</title>
            <link>{post.url}</link>
          </item>
        ))}
      </>
    )
  }
}
```

Class components are registered with **Request scope** by default, meaning each request gets fresh instances. This ensures proper isolation when using request-scoped services.

#### Props with Schema Validation

Class components can accept props validated by a Zod schema:

```tsx
import { z } from 'zod/v4'

const ItemPropsSchema = z.object({
  id: z.string(),
  showDetails: z.boolean().optional(),
})

@Component({ schema: ItemPropsSchema })
class ItemComponent implements XmlComponent {
  constructor(private props: z.output<typeof ItemPropsSchema>) {}

  async render() {
    const item = await this.dataService.getItem(this.props.id)
    return <item id={item.id}>{item.title}</item>
  }
}

// Usage with typed props
;<ItemComponent id="123" showDetails={true} />
```

## Type-Safe Tags with defineTag

For stricter type checking of XML attributes, use `defineTag()` to create typed tag components. It is also useful for working with namespaces and custom tags.

:::tip PascalCase Recommendation
When using `defineTag()` to create reusable typed tags, use **PascalCase** for variable names (e.g., `const Channel = defineTag('channel')`). This avoids IDE warnings about lowercase custom components while still outputting the correct lowercase XML tag name.
:::

```typescript
import { defineTag } from '@navios/adapter-xml'

import { z } from 'zod/v4'

// Simple tag without attribute validation
const Item = defineTag('item')

// Tag with required attributes
const Link = defineTag(
  'link',
  z.object({
    href: z.string().url(),
    rel: z.enum(['self', 'alternate']),
  }),
)

// Namespaced tag (e.g., for Atom feeds)
const AtomLink = defineTag(
  'atom:link',
  z.object({
    href: z.string(),
    rel: z.string(),
    type: z.string().optional(),
  }),
)
```

Usage in JSX:

```tsx
<Item>
  <Link href="https://example.com" rel="alternate" />
  <AtomLink
    href="https://example.com/feed"
    rel="self"
    type="application/atom+xml"
  />
</Item>
```

The tag name in the output XML will be the first argument to `defineTag()` (lowercase), while the PascalCase variable name satisfies JSX component conventions.

## Special Content Handling

### CDATA Sections

Use the `CData` component for text content containing special characters that shouldn't be escaped:

```tsx
import { CData } from '@navios/adapter-xml'
;<description>
  <CData>{`<p>HTML content with <tags> & special characters</p>`}</CData>
</description>
// Output: <description><![CDATA[<p>HTML content with <tags> & special characters</p>]]></description>
```

### Raw XML Insertion

For pre-rendered XML or HTML content, use `DangerouslyInsertRawXml`:

```tsx
import { DangerouslyInsertRawXml } from '@navios/adapter-xml'
;<content:encoded>
  <DangerouslyInsertRawXml>{htmlContent}</DangerouslyInsertRawXml>
</content:encoded>
```

:::caution
`DangerouslyInsertRawXml` bypasses all XML escaping. Only use with trusted content to avoid XML injection vulnerabilities.
:::

## Mixed Endpoints

XML endpoints work alongside regular JSON endpoints in the same controller:

```tsx
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import {
  XmlStream,
  declareXmlStream,
  XmlStreamParams,
} from '@navios/adapter-xml'
import { builder } from '@navios/builder'

const getJsonData = builder().declareEndpoint({
  method: 'GET',
  url: '/api/posts',
  responseSchema: z.array(postSchema),
})

const getRssFeed = declareXmlStream({
  method: 'GET',
  url: '/feed.xml',
  contentType: 'application/rss+xml',
})

@Controller()
class PostController {
  @Endpoint(getJsonData)
  async getPosts(params: EndpointParams<typeof getJsonData>) {
    return this.postService.getAll()
  }

  @XmlStream(getRssFeed)
  async getRssFeed(params: XmlStreamParams<typeof getRssFeed>) {
    const posts = await this.postService.getAll()
    return <rss version="2.0">...</rss>
  }
}
```

## API Reference

### declareXmlStream(config)

Declares an XML stream endpoint with the following options:

| Option           | Type         | Default             | Description                                  |
| ---------------- | ------------ | ------------------- | -------------------------------------------- |
| `method`         | `HttpMethod` | required            | HTTP method (GET, POST, etc.)                |
| `url`            | `string`     | required            | URL path with optional `$param` placeholders |
| `contentType`    | `string`     | `'application/xml'` | Response content type                        |
| `xmlDeclaration` | `boolean`    | `true`              | Include `<?xml?>` declaration                |
| `encoding`       | `string`     | `'UTF-8'`           | XML encoding                                 |
| `querySchema`    | `ZodType`    | -                   | Schema for query parameters                  |
| `requestSchema`  | `ZodType`    | -                   | Schema for request body                      |

### @XmlStream(endpoint)

Decorator for controller methods that return XML JSX.

### @Component(options?)

Decorator for class-based XML components with DI support.

| Option     | Type        | Description             |
| ---------- | ----------- | ----------------------- |
| `schema`   | `ZodObject` | Props validation schema |
| `registry` | `Registry`  | Custom DI registry      |

### XmlComponent

Interface that class components must implement:

```typescript
interface XmlComponent {
  render(): AnyXmlNode | Promise<AnyXmlNode>
}
```

### defineTag(name, propsSchema?)

Creates a type-safe XML tag component.

### defineXmlEnvironment()

Returns environment tokens to merge with your primary adapter.

### Built-in Components

- `CData` - Wraps content in CDATA section
- `DangerouslyInsertRawXml` - Inserts raw XML without escaping

## License

MIT
