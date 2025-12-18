---
sidebar_position: 3
title: XML
---

# XML Adapter

`@navios/adapter-xml` provides JSX-based XML rendering for Navios applications. It enables building XML responses (RSS feeds, sitemaps, Atom feeds, etc.) using familiar JSX syntax with full TypeScript support.

**Package:** `@navios/adapter-xml`  
**License:** MIT  
**Runtime:** Node.js (Fastify) or Bun

## Installation

```bash
npm install @navios/adapter-xml
# or
bun add @navios/adapter-xml
```

## Quick Start

### TypeScript Configuration

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

### Basic Example

```tsx
import { Controller } from '@navios/core'
import { XmlStream, declareXmlStream, defineTag } from '@navios/adapter-xml'
import { z } from 'zod/v4'

const getRssFeed = declareXmlStream({
  method: 'GET',
  url: '/feed.xml',
  contentType: 'application/rss+xml',
})

const rss = defineTag('rss', z.object({ version: z.literal('2.0') }))
const channel = defineTag('channel')
const title = defineTag('title')
const item = defineTag('item')

@Controller()
export class FeedController {
  @XmlStream(getRssFeed)
  async getFeed() {
    return (
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          {posts.map((post) => (
            <item>
              <title>{post.title}</title>
            </item>
          ))}
        </channel>
      </rss>
    )
  }
}
```

## Features

- **JSX Syntax** - Write XML using JSX with TypeScript type checking
- **Async Components** - Support for async components that fetch data during rendering
- **Class Components** - `@Component` decorator with dependency injection support
- **Type-Safe Tags** - Define custom XML tags with Zod schema validation
- **CDATA Support** - Built-in `CData` component for safe text content
- **XML Namespaces** - Full support for namespaced tags (e.g., `atom:link`)

## API Reference

### `defineXmlEnvironment()`

Returns environment configuration to merge with your base adapter.

### `declareXmlStream(config)`

Declares an XML stream endpoint.

```typescript
declareXmlStream({
  method: HttpMethod
  url: string
  contentType?: 'application/xml' | 'text/xml' | 'application/rss+xml' | 'application/atom+xml'
  xmlDeclaration?: boolean // Default: true
  encoding?: string // Default: 'UTF-8'
})
```

### `@XmlStream(endpoint)`

Decorator for controller methods that return XML.

### `defineTag(name, propsSchema?)`

Creates a type-safe XML tag component.

## Examples

See the [XML Adapter documentation](/docs/packages/adapter-xml/overview) for complete examples including RSS feeds, sitemaps, and Atom feeds.

## Integration

The XML adapter works with both Fastify and Bun adapters. Simply merge the environments as shown in the Quick Start section.

## License

MIT

