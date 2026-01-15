---
sidebar_position: 5
title: Plugins
---

# Plugins

Extend your Navios application with plugins that hook into the application lifecycle.

## Overview

Plugins allow you to extend Navios applications by executing code at specific points in the application lifecycle. Common use cases include:

- Adding OpenAPI documentation
- Integrating observability tools (OpenTelemetry, etc.)
- Registering global middleware
- Extending the dependency injection container
- Adding custom routes or services

## Plugin Lifecycle Stages

Navios executes plugins at specific stages during application initialization. Each stage provides access to different parts of the application context:

```
NaviosFactory.create() returns
       ↓
app.usePlugin(...)  ← register plugins here
       ↓
app.init() starts
       ↓
┌─ pre:modules-traverse   → container only
├─ loadModules()
└─ post:modules-traverse  → container + modules + moduleLoader
       ↓
┌─ pre:adapter-resolve    → container + modules + moduleLoader
├─ container.get(AdapterToken)
└─ post:adapter-resolve   → + adapter
       ↓
┌─ pre:adapter-setup      → full context
├─ adapter.setupAdapter()
└─ post:adapter-setup     → full context
       ↓
┌─ pre:modules-init       → full context
├─ adapter.onModulesInit()
└─ post:modules-init      → full context (legacy default)
       ↓
┌─ pre:ready              → full context
├─ adapter.ready()
└─ post:ready             → full context
```

### Stage Contexts

Different stages have access to different parts of the application:

| Stage | Container | Modules | ModuleLoader | Adapter |
|-------|-----------|---------|--------------|---------|
| `pre:modules-traverse` | ✓ | | | |
| `post:modules-traverse` | ✓ | ✓ | ✓ | |
| `pre:adapter-resolve` | ✓ | ✓ | ✓ | |
| `post:adapter-resolve` | ✓ | ✓ | ✓ | ✓ |
| `pre:adapter-setup` | ✓ | ✓ | ✓ | ✓ |
| `post:adapter-setup` | ✓ | ✓ | ✓ | ✓ |
| `pre:modules-init` | ✓ | ✓ | ✓ | ✓ |
| `post:modules-init` | ✓ | ✓ | ✓ | ✓ |
| `pre:ready` | ✓ | ✓ | ✓ | ✓ |
| `post:ready` | ✓ | ✓ | ✓ | ✓ |

## Creating Plugins

### Using Helper Functions (Recommended)

Navios provides curried helper functions for creating plugins:

```typescript
import { definePreAdapterResolvePlugin } from '@navios/core'

// Define your plugin factory
export const defineMyPlugin = definePreAdapterResolvePlugin({
  name: 'my-plugin',
  register: (context, options: { enabled: boolean }) => {
    if (options.enabled) {
      // Access container, modules, moduleLoader (no adapter yet)
      const registry = context.container.getRegistry()
      // ... your plugin logic
    }
  },
})

// Usage
app.usePlugin(defineMyPlugin({ enabled: true }))
```

### Available Helper Functions

For stages **without** adapter access (container/modules only):

```typescript
import {
  definePreModulesTraversePlugin,  // pre:modules-traverse
  definePostModulesTraversePlugin, // post:modules-traverse
  definePreAdapterResolvePlugin,   // pre:adapter-resolve
} from '@navios/core'
```

For stages **with** adapter access:

```typescript
import {
  definePostAdapterResolvePlugin,  // post:adapter-resolve
  definePreAdapterSetupPlugin,     // pre:adapter-setup
  definePostAdapterSetupPlugin,    // post:adapter-setup
  definePreModulesInitPlugin,      // pre:modules-init
  definePostModulesInitPlugin,     // post:modules-init (legacy default)
  definePreReadyPlugin,            // pre:ready
  definePostReadyPlugin,           // post:ready
} from '@navios/core'

// These require a type parameter for the adapter
export const defineMyPlugin = definePostAdapterResolvePlugin<
  BunApplicationServiceInterface
>()({
  name: 'my-plugin',
  register: (context, options) => {
    // context.adapter is typed as BunApplicationServiceInterface
  },
})
```

### Plugin Examples

#### Early Container Setup

Register services before modules are loaded:

```typescript
import { definePreModulesTraversePlugin } from '@navios/core'
import { InjectionToken } from '@navios/di'

const ConfigToken = InjectionToken.create<Config>('Config')

export const defineConfigPlugin = definePreModulesTraversePlugin({
  name: 'config',
  register: (context, options: Config) => {
    context.container.addInstance(ConfigToken, options)
  },
})

// Usage
app.usePlugin(defineConfigPlugin({
  apiUrl: 'https://api.example.com',
  debug: true,
}))
```

#### Pre-Adapter Instrumentation

Modify the DI container before the adapter is instantiated (useful for OpenTelemetry):

```typescript
import { definePreAdapterResolvePlugin } from '@navios/core'

export const defineOtelPlugin = definePreAdapterResolvePlugin({
  name: 'otel',
  register: (context, options: { serviceName: string }) => {
    // Modify registry before adapter is created
    const registry = context.container.getRegistry()
    // Wrap or instrument services here
  },
})
```

#### Post-Init Routes

Add routes after all modules are initialized (like OpenAPI):

```typescript
import { definePostModulesInitPlugin } from '@navios/core'
import type { BunApplicationServiceInterface } from '@navios/adapter-bun'

export const defineDocsPlugin = definePostModulesInitPlugin<
  BunApplicationServiceInterface
>()({
  name: 'docs',
  register: (context, options: { path: string }) => {
    // Routes are registered, add documentation endpoint
    context.adapter.getServer().get(options.path, () => {
      return new Response('Documentation', { status: 200 })
    })
  },
})
```

## Registering Plugins

Use `app.usePlugin()` to register plugins:

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})

// Single plugin
app.usePlugin(defineOpenApiPlugin({
  info: { title: 'My API', version: '1.0.0' },
}))

// Multiple plugins in one call
app.usePlugin([
  defineOtelPlugin({ serviceName: 'my-service' }),
  defineOpenApiPlugin({ info: { title: 'My API', version: '1.0.0' } }),
])

await app.init()
await app.listen({ port: 3000 })
```

## Stage Selection Guide

Choose your plugin stage based on what you need to do:

| Use Case | Recommended Stage |
|----------|-------------------|
| Register global DI tokens | `pre:modules-traverse` |
| Inspect loaded modules | `post:modules-traverse` |
| Instrument services before adapter creation | `pre:adapter-resolve` |
| Configure adapter settings | `post:adapter-resolve` |
| Add middleware before routes | `pre:modules-init` |
| Generate documentation from routes | `post:modules-init` |
| Log startup complete | `post:ready` |

## Backward Compatibility

The legacy `NaviosPlugin` interface is still supported and automatically maps to the `post:modules-init` stage:

```typescript
// Legacy pattern (still works)
const myPlugin: NaviosPlugin<{ enabled: boolean }> = {
  name: 'my-plugin',
  register: async (context, options) => {
    // Runs at post:modules-init stage
  },
}

app.usePlugin({
  plugin: myPlugin,
  options: { enabled: true },
})
```

For new plugins, we recommend using the staged plugin helpers for explicit stage control and better type safety.

## Context Types

For TypeScript, you can import the context types:

```typescript
import type {
  ContainerOnlyContext,   // pre:modules-traverse
  ModulesLoadedContext,   // post:modules-traverse, pre:adapter-resolve
  FullPluginContext,      // All stages after adapter is resolved
} from '@navios/core'
```
