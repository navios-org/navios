---
sidebar_position: 1
slug: /
---

# Dependency Injection Documentation

Welcome to the Navios DI documentation. This section covers the dependency injection system that powers Navios applications.

## Packages

### @navios/di

A lightweight, type-safe dependency injection container for TypeScript. Features hierarchical containers, multiple scopes, and async resolution.

**Key Features:**
- Type-safe dependency resolution
- Hierarchical containers with scope inheritance
- Request, Singleton, and Transient scopes
- Async factory support
- Event bus for inter-service communication

[Get Started with DI](/docs/di/di/overview)

### @navios/di-react

React bindings for @navios/di. Seamlessly integrate dependency injection into your React applications with hooks and providers.

**Key Features:**
- React context integration
- `useService` and `useSuspenseService` hooks
- Automatic scope management
- Server-side rendering support

[React Integration](/docs/di/di-react/overview)
