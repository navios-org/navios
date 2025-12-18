---
sidebar_position: 1
slug: /
---

# Builder Documentation

Welcome to the Navios Builder documentation. This section covers packages for building type-safe API clients and integrations.

## Packages

### @navios/builder

A type-safe API declaration builder that enables sharing endpoint definitions between client and server. Define your API once and use it everywhere with full TypeScript support.

**Key Features:**
- Declarative endpoint definitions
- Shared types between client and server
- Zod schema validation
- Support for REST, streams, and multipart uploads

[Get Started with Builder](/docs/builder/builder/overview)

### @navios/http

A lightweight, fetch-based HTTP client that serves as a modern alternative to axios. Works seamlessly with `@navios/builder` for type-safe API calls.

**Key Features:**
- Native `fetch` API everywhere
- Next.js caching support
- Familiar axios-like API
- Interceptors support

[HTTP Client Documentation](/docs/packages/http/overview)

### @navios/react-query

TanStack React Query integration for Navios. Use your builder-defined endpoints with React Query's powerful data fetching capabilities.

**Key Features:**
- Automatic query key generation
- Type-safe hooks
- Optimistic updates
- Infinite queries support

[React Query Integration](/docs/builder/react-query/overview)
