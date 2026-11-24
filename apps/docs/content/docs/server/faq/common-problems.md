---
sidebar_position: 1
title: Common Problems
---

# Common Problems

Solutions to frequently encountered issues when working with Navios.

## TypeScript Configuration

Navios uses **TypeScript 5 native decorators** (ES decorators), not the legacy experimental decorators. This means your `tsconfig.json` must have the experimental decorator options **disabled** (or omitted, as `false` is the default).

### Correct Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false
  }
}
```

Key settings for ESM projects:

- `"module": "NodeNext"` - Enables ES modules with Node.js interop
- `"moduleResolution": "NodeNext"` - Uses Node.js ESM resolution algorithm
- `"verbatimModuleSyntax": true` - Enforces explicit `type` imports

### Common Mistake

If you previously used NestJS or other frameworks that rely on legacy decorators, you might have these options enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**These must be set to `false` or removed entirely** for Navios decorators to work correctly.

:::tip Alternative: Legacy Decorators
If you cannot disable `experimentalDecorators`, you can use the legacy-compatible decorators from `@navios/core/legacy-compat` and `@navios/di/legacy-compat`. See the [NestJS Migration Guide](/docs/server/guides/migrating-from-nestjs#step-2-configure-typescript) for details.
:::

### Why This Matters

- **Legacy decorators** (`experimentalDecorators: true`) use a different specification and runtime behavior
- **Native decorators** (TypeScript 5+) follow the TC39 Stage 3 decorator proposal
- Mixing these will cause decorators to silently fail or produce unexpected behavior

## ES Decorators Support in Bun

Bun supports **Legacy Decorators** natively (with `experimentalDecorators: true`). If you want to use **Stage 3 decorators** (TypeScript 5 native decorators) with Navios, you need to configure a plugin that transpiles TypeScript files with proper decorator support.

### Solution: Bun Plugin with TypeScript

Create a `bun-plugin.mts` file in your project root:

```typescript
// bun-plugin.mts
import { plugin } from 'bun'

plugin({
  name: 'typescript-decorators',
  setup(build) {
    const filter = /\.m?(ts|tsx)$/

    build.onLoad({ filter }, async (args) => {
      const codeTs = await Bun.file(args.path).text()
      const typescript = (await import('typescript')).default

      const result = typescript.transpileModule(codeTs, {
        compilerOptions: {
          module: typescript.ModuleKind.ESNext,
          target: typescript.ScriptTarget.ESNext,
          jsx: typescript.JsxEmit.React,
        },
      })

      return {
        loader: 'js',
        contents: result.outputText,
      }
    })
  },
})
```

### Configure Bun to Use the Plugin

Create or update `bunfig.toml` in your project root:

```toml
preload = ["./bun-plugin.mts"]
```

### Install TypeScript

```bash
bun add -d typescript
```

### Alternative: Use Node.js

If you don't need Bun-specific features, consider using the Fastify adapter with Node.js, which has full native support for ES decorators when using TypeScript 5+ with `tsx` or similar tools.
