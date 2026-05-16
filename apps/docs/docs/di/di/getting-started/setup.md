---
sidebar_position: 1
---

# Setup

Get Navios DI installed and configured in your project.

## Installation

Install Navios DI using your preferred package manager:

```bash
npm install @navios/di zod
# or
yarn add @navios/di zod
# or
pnpm add @navios/di zod
```

:::info
`zod` is a peer dependency required for schema validation with injection tokens. If you're not using injection tokens with schemas, you can skip it, but it's recommended for type-safe configuration.
:::

## Prerequisites

- **Runtime**: Node.js 18+, Bun, Deno, or modern browsers
- **TypeScript**: 5.2 or higher (stage-3 decorators + decorator metadata)
- **Modern TypeScript project**: ES2022+ target recommended

:::info
v2 requires a runtime/toolchain with **stage-3 decorators and decorator metadata** (`Symbol.metadata`). TypeScript 5.2+ with `"useDefineForClassFields": true` (the default for modern targets), or a Babel/SWC setup with the stage-3 decorators + decorator-metadata transforms. The v1 `@navios/di/legacy-compat` module (and `experimentalDecorators` support) was removed in v2.
:::

:::tip Browser Support
Navios DI works seamlessly in browser environments. Bundlers like Vite, webpack, and esbuild automatically use the optimized browser build. See the [Browser Support guide](/docs/di/di/guides/browser-support) for details.
:::

## TypeScript Configuration

Make sure your `tsconfig.json` has the correct settings for decorators:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "useDefineForClassFields": true,
    "experimentalDecorators": false
  }
}
```

:::important
Navios DI v2 uses **native stage-3 decorators**, not legacy decorators. Ensure `experimentalDecorators` is set to `false` (or omitted) and `useDefineForClassFields` is `true`. The v1 legacy-decorator escape hatch (`@navios/di/legacy-compat`) was **removed in v2** — stage-3 is now required.
:::

## Troubleshooting

### Decorators Not Working

**Problem**: Decorators are not being recognized.

**Solution**:
- Ensure `experimentalDecorators: false` in `tsconfig.json`
- Make sure you're using TypeScript 5+
- Check that your build tool supports ES decorators

## Next Steps

- **[First Service](/docs/di/di/getting-started/first-service)** - Create your first service