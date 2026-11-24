# @navios/otel-bun

> **Deprecated.** Use [`@navios/otel`](../otel/README.md) directly.

In Navios 2.0 the OpenTelemetry plugin is adapter-neutral: one plugin in `@navios/otel` traces requests through an interceptor and works the same on Bun, Fastify and the in-memory test adapter. This package no longer replaces the Bun controller adapter; it only re-exports that plugin, so that existing imports keep resolving. It will be removed in a later major version.

## Migration

```typescript
// before
import { defineOtelPlugin } from '@navios/otel-bun'

for (const plugin of defineOtelPlugin(options)) {
  app.usePlugin(plugin)
}

// after
import { otelPlugin } from '@navios/otel'

app.usePlugin(otelPlugin(options))
```

What this package exports:

| Export                 | Is                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `defineOtelPlugin`     | Returns `[otelPlugin(options)]`: a one-element array, so the 1.x registration loop keeps working |
| `otelPlugin`           | `otelPlugin` from `@navios/otel`                                                                 |
| `BunOtelPluginOptions` | `OtelPluginOptions` from `@navios/otel`                                                          |

Removed in 2.0:

- `TracedBunControllerAdapterService`, `OtelBunPreAdapterPlugin`, `OtelBunPostModulesPlugin` and `BunOtelOptionsToken`. Requests are traced by `OtelHttpInterceptor` from `@navios/otel`.
- The `guard:<name>` child spans. A request has one server span that covers guards, validation and the handler; trace a service with `@Traced` for finer spans.

Everything else, including configuration, `@Traced` and context propagation, is documented in the [`@navios/otel` README](../otel/README.md).

## License

MIT
