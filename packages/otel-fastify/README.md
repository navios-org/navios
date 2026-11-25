# @navios/otel-fastify

> **Deprecated.** Use [`@navios/otel`](../otel/README.md) directly.

In Navios 2.0 the OpenTelemetry plugin is adapter-neutral: one plugin in `@navios/otel` traces requests through an interceptor and works the same on Fastify, Bun and the in-memory test adapter. This package has no Fastify-specific work left and only re-exports that plugin, so that existing imports keep resolving. It will be removed in a later major version.

## Migration

```typescript
// before
import { defineOtelPlugin } from '@navios/otel-fastify'

app.usePlugin(defineOtelPlugin(options))

// after
import { otelPlugin } from '@navios/otel'

app.usePlugin(otelPlugin(options))
```

What this package exports:

| Export                     | Is                                                  |
| -------------------------- | --------------------------------------------------- |
| `defineOtelPlugin`         | `otelPlugin` from `@navios/otel` under its 1.x name |
| `otelPlugin`               | `otelPlugin` from `@navios/otel`                    |
| `FastifyOtelPluginOptions` | `OtelPluginOptions` from `@navios/otel`             |

Removed in 2.0:

- `OtelFastifyPlugin` and the hook factories `createOnRequestHook`, `createOnResponseHook` and `createOnErrorHook`. Requests are traced by `OtelHttpInterceptor` from `@navios/otel/http`.
- `request.otelSpan`. Read the request span from the request context: `ctx.find(RequestSpan)`, with `RequestSpan` from `@navios/otel`.
- A span for requests that match no route. Fastify's hooks ran for those; an interceptor runs only for a matched route.

Everything else, including configuration, `@Traced` and context propagation, is documented in the [`@navios/otel` README](../otel/README.md).

## License

MIT
