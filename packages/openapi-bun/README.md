# @navios/openapi-bun

> **Deprecated.** Use [`@navios/openapi`](../openapi/README.md) directly. Since 2.0 it serves the OpenAPI document and the Scalar page on every adapter, so there is nothing Bun-specific left. This package re-exports `@navios/openapi` so that existing imports keep working, and will be removed in a later major version.

## Migration

```diff
-import { defineOpenApiPlugin } from '@navios/openapi-bun'
+import { openApiPlugin } from '@navios/openapi'

-app.usePlugin(defineOpenApiPlugin({ info: { title: 'My API', version: '1.0.0' } }))
+app.usePlugin(openApiPlugin({ info: { title: 'My API', version: '1.0.0' } }))
```

Then remove `@navios/openapi-bun` from your dependencies. Options, attributes and behaviour are documented in the [`@navios/openapi` README](../openapi/README.md), including what changed since 1.x.

## What this package exports

Everything `@navios/openapi` exports, plus the type alias `BunOpenApiPluginOptions` (`OpenApiPluginOptions`). `defineOpenApiPlugin` is the deprecated name of `openApiPlugin`.

No longer exported: the plugin class, the Zod option schemas and the other internals of 1.x; see the changelog.
