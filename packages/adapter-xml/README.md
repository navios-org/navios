# @navios/adapter-xml

A JSX-based XML adapter for Navios that enables building XML responses (RSS feeds, sitemaps, Atom feeds, etc.) using familiar JSX syntax with full TypeScript support.

## Features

- **JSX Syntax** - Write XML using JSX with TypeScript type checking
- **Async Components** - Support for async components that fetch data during rendering
- **Type-Safe Tags** - Define custom XML tags with Zod schema validation
- **Runtime Agnostic** - Works with both Fastify and Bun adapters
- **CDATA Support** - Built-in `CData` component for safe text content
- **Raw XML** - `DangerouslyInsertRawXml` for pre-rendered content
- **XML Namespaces** - Full support for namespaced tags (e.g., `atom:link`)

## Installation

```bash
npm install @navios/adapter-xml
# or
yarn add @navios/adapter-xml
```

## Configuration

### TypeScript Setup

Configure your `tsconfig.json` to use the JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@navios/adapter-xml"
  }
}
```

### Environment Setup

Merge the XML environment with your base adapter (Fastify or Bun):

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineXmlEnvironment } from '@navios/adapter-xml'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.mjs'

async function bootstrap() {
  const fastifyEnv = defineFastifyEnvironment()
  const xmlEnv = defineXmlEnvironment()

  const mergedEnv = {
    httpTokens: new Map([...fastifyEnv.httpTokens, ...xmlEnv.httpTokens]),
  }

  const app = await NaviosFactory.create(AppModule, {
    adapter: mergedEnv,
  })

  await app.init()
  await app.listen({ port: 3000 })
}
```

## Usage

### Basic Example - RSS Feed

Define your XML tags:

```typescript
// tags.ts
import { defineTag } from '@navios/adapter-xml'

import { z } from 'zod/v4'

export const rss = defineTag(
  'rss',
  z.object({
    version: z.literal('2.0'),
    'xmlns:atom': z.string().optional(),
  }),
)
export const channel = defineTag('channel')
export const title = defineTag('title')
export const link = defineTag('link')
export const description = defineTag('description')
export const item = defineTag('item')
export const pubDate = defineTag('pubDate')
export const atomLink = defineTag(
  'atom:link',
  z.object({
    href: z.string(),
    rel: z.string(),
    type: z.string().optional(),
  }),
)
```

Declare your endpoint:

```typescript
// api.ts
import { declareXmlStream } from '@navios/adapter-xml'

export const getRssFeed = declareXmlStream({
  method: 'GET',
  url: '/feed.xml',
  contentType: 'application/rss+xml',
})
```

Create the controller:

```tsx
// feed.controller.tsx
import { Controller } from '@navios/core'
import { XmlStream } from '@navios/adapter-xml'
import { getRssFeed } from './api'
import {
  rss,
  channel,
  title,
  link,
  description,
  item,
  pubDate,
  atomLink,
} from './tags'

@Controller('/api')
export class FeedController {
  @XmlStream(getRssFeed)
  async getFeed() {
    const posts = await this.fetchPosts()

    return (
      <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          <description>Latest posts from my blog</description>
          <atomLink
            href="https://example.com/feed.xml"
            rel="self"
            type="application/rss+xml"
          />
          {posts.map((post) => (
            <item>
              <title>{post.title}</title>
              <link>{post.url}</link>
              <pubDate>{post.publishedAt.toUTCString()}</pubDate>
              <description>{post.excerpt}</description>
            </item>
          ))}
        </channel>
      </rss>
    )
  }

  private async fetchPosts() {
    // Fetch posts from database
    return []
  }
}
```

### Defining Tags

Use `defineTag` to create type-safe XML tags:

```typescript
import { defineTag } from '@navios/adapter-xml'
import { z } from 'zod/v4'

// Simple tag without props validation
const item = defineTag('item')

// Tag with required props
const link = defineTag('link', z.object({
  href: z.string().url(),
  rel: z.enum(['self', 'alternate', 'enclosure']),
}))

// Namespaced tag
const atomLink = defineTag('atom:link', z.object({
  href: z.string(),
  rel: z.string(),
  type: z.string().optional(),
}))

// Usage
<link href="https://example.com" rel="self" />
<atomLink href="https://example.com/feed" rel="alternate" />
```

### Async Components

Components can be async functions that fetch data during rendering:

```tsx
interface PostItemProps {
  postId: string
}

async function PostItem({ postId }: PostItemProps) {
  const post = await fetchPostById(postId)

  return (
    <item>
      <title>{post.title}</title>
      <link>{post.url}</link>
      <pubDate>{post.publishedAt.toUTCString()}</pubDate>
    </item>
  )
}

// Multiple async components are resolved in parallel
async function LatestPosts() {
  const postIds = await getLatestPostIds()

  return (
    <>
      {postIds.map((id) => (
        <PostItem postId={id} />
      ))}
    </>
  )
}
```

### CDATA Sections

Use `CData` for text content that may contain special characters:

```tsx
import { CData } from '@navios/adapter-xml'
;<description>
  <CData>{`This content has <special> characters & more`}</CData>
</description>
// Output: <description><![CDATA[This content has <special> characters & more]]></description>
```

### Raw XML Content

Use `DangerouslyInsertRawXml` for pre-rendered HTML/XML content:

```tsx
import { DangerouslyInsertRawXml } from '@navios/adapter-xml'

const contentEncoded = defineTag('content:encoded')

const htmlContent = '<p>Hello <strong>World</strong></p>'

<contentEncoded>
  <DangerouslyInsertRawXml>{htmlContent}</DangerouslyInsertRawXml>
</contentEncoded>
// Output: <content:encoded><p>Hello <strong>World</strong></p></content:encoded>
```

**Warning:** `DangerouslyInsertRawXml` bypasses all XML escaping. Only use with trusted content.

## API Reference

### `defineTag(name, propsSchema?)`

Creates a type-safe XML tag component.

- `name` - Tag name (supports namespaces like `atom:link`)
- `propsSchema` - Optional Zod schema for props validation

### `declareXmlStream(config)`

Declares an XML stream endpoint.

```typescript
interface BaseXmlStreamConfig {
  method: HttpMethod
  url: string
  querySchema?: ZodType
  requestSchema?: ZodType
  contentType?:
    | 'application/xml'
    | 'text/xml'
    | 'application/rss+xml'
    | 'application/atom+xml'
  xmlDeclaration?: boolean // Include <?xml?> declaration (default: true)
  encoding?: string // XML encoding (default: 'UTF-8')
}
```

### `@XmlStream(endpoint)`

Decorator for controller methods that return XML.

### `defineXmlEnvironment()`

Returns environment configuration to merge with your base adapter.

### `CData`

Component for CDATA sections. Automatically handles content containing `]]>`.

### `DangerouslyInsertRawXml`

Component for inserting raw XML/HTML without escaping.

### `renderToXml(node, options?)`

Low-level function to render JSX to XML string.

```typescript
interface RenderOptions {
  declaration?: boolean // Include XML declaration
  encoding?: string // XML encoding
  pretty?: boolean // Pretty print output
}
```

## Content Types

The adapter supports these content types:

- `application/xml` (default)
- `text/xml`
- `application/rss+xml`
- `application/atom+xml`

## Examples

### Sitemap

```tsx
const urlset = defineTag('urlset', z.object({
  xmlns: z.string(),
}))
const url = defineTag('url')
const loc = defineTag('loc')
const lastmod = defineTag('lastmod')
const changefreq = defineTag('changefreq')
const priority = defineTag('priority')

@XmlStream(getSitemapDefinition)
async getSitemap() {
  const pages = await this.getPages()

  return (
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      {pages.map(page => (
        <url>
          <loc>{page.url}</loc>
          <lastmod>{page.updatedAt.toISOString()}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>{page.priority}</priority>
        </url>
      ))}
    </urlset>
  )
}
```

### Atom Feed

```tsx
const feed = defineTag('feed', z.object({
  xmlns: z.string(),
}))
const entry = defineTag('entry')
const id = defineTag('id')
const updated = defineTag('updated')
const author = defineTag('author')
const name = defineTag('name')
const content = defineTag('content', z.object({
  type: z.string().optional(),
}))

@XmlStream(getAtomFeedDefinition)
async getAtomFeed() {
  const posts = await this.getPosts()

  return (
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>My Blog</title>
      <link href="https://example.com" rel="alternate" />
      <id>urn:uuid:blog-feed-id</id>
      <updated>{new Date().toISOString()}</updated>
      {posts.map(post => (
        <entry>
          <title>{post.title}</title>
          <link href={post.url} rel="alternate" />
          <id>{post.id}</id>
          <updated>{post.updatedAt.toISOString()}</updated>
          <author>
            <name>{post.author}</name>
          </author>
          <content type="html">
            <CData>{post.content}</CData>
          </content>
        </entry>
      ))}
    </feed>
  )
}
```

## License

MIT
