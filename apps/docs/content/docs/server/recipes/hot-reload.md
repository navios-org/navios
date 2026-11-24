---
sidebar_position: 1
title: Hot Reload
---

# Hot Reload

Enable hot module replacement (HMR) for rapid development with the Fastify adapter.

:::info Fastify Only
Hot reload via `@navios/cli` is currently only supported with the Fastify adapter on Node.js.
:::

## Using @navios/cli

`@navios/cli` provides a development server with hot reload powered by Vite.

### Installation

```bash
npm install -D @navios/cli
```

### Commands

#### Development Server

Start the development server with hot reload:

```bash
npx navios serve
```

Or add it to your `package.json`:

```json
{
  "scripts": {
    "dev": "navios serve",
    "build": "navios build"
  }
}
```

#### Production Build

Build your application for production:

```bash
npx navios build
```

## How It Works

`@navios/cli` uses Vite internally to provide:

- Fast cold starts
- Instant hot module replacement
- Optimized production builds
- TypeScript support out of the box

## Custom Vite Configuration

If your project has an existing `vite.config.ts` file, `@navios/cli` will automatically merge its configuration. This allows you to add custom plugins, define aliases, or adjust build settings:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'process.env.APP_VERSION': JSON.stringify('1.0.0'),
  },
})
```

## Manual Plugin Configuration

For advanced use cases, `@navios/cli` exports the `NaviosPlugin` for manual Vite configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { NaviosPlugin } from '@navios/cli'

export default defineConfig({
  plugins: [
    NaviosPlugin({
      // Plugin options
    }),
  ],
})
```

This gives you full control over the Vite configuration while still benefiting from Navios's build optimizations.

## Example Project Structure

```
my-app/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
├── tsconfig.json
└── vite.config.ts (optional)
```

```typescript
// src/main.ts
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { AppModule } from './app.module.js'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

await app.listen({ port: 3000 })
```

Run with hot reload:

```bash
npm run dev
```

Changes to your controllers, services, and modules will be reflected instantly without restarting the server.
