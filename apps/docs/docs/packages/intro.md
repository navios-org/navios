---
sidebar_position: 1
slug: /
---

# Packages Documentation

Welcome to the Navios Packages documentation. This section covers additional packages that extend Navios's capabilities.

## Available Packages

### HTTP Client

**@navios/http** - A lightweight, fetch-based HTTP client that serves as a modern alternative to axios.

- Native `fetch` API everywhere
- Next.js caching support
- Familiar axios-like API
- Interceptors support
- TypeScript-first

[Get Started with HTTP Client](/docs/packages/http/overview)

### JWT Authentication

**@navios/jwt** - Type-safe JWT signing and verification for Navios applications.

- Token signing and verification
- Multiple algorithms support
- Dependency injection integration
- Dynamic key providers
- Full TypeScript support

[Get Started with JWT](/docs/packages/jwt/overview)

### Job Scheduling

**@navios/schedule** - Decorator-based job scheduling with cron support.

- Cron-based scheduling
- Decorator-based API
- Dependency injection support
- Error handling
- Runtime job management

[Get Started with Schedule](/docs/packages/schedule/overview)

### CLI Commands

**@navios/commander** - Build CLI applications with decorators and dependency injection.

- Decorator-based commands
- Schema validation with Zod
- Modular architecture
- Full DI integration

[Get Started with Commander](/docs/packages/commander/overview)

### XML Adapter

**@navios/adapter-xml** - Build XML responses (RSS, sitemaps, Atom feeds) using JSX.

- JSX syntax for XML
- Type-safe tags
- Async components
- Class components with DI
- Works with Fastify and Bun

[Get Started with XML Adapter](/docs/packages/adapter-xml/overview)

## Installation

Each package can be installed independently:

```bash
# HTTP Client
npm install @navios/http

# JWT
npm install @navios/jwt

# Schedule
npm install @navios/schedule @navios/core cron

# Commander
npm install @navios/commander @navios/di zod

# XML Adapter
npm install @navios/adapter-xml
```

## Related Documentation

- [Server Documentation](/docs/server) - Core server framework
- [Builder Documentation](/docs/builder) - API client builder
- [DI Documentation](/docs/di) - Dependency injection system
