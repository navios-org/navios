---
title: Introduction
---

# Navios Server

Navios Server is an HTTP framework for TypeScript built on one idea: an endpoint is declared once, with [`@navios/builder`](/docs/builder/), and the server implements that declaration. The route, the request validation, the response validation and the handler's types all come from it, and a client can call the same declaration with the same types.

```ts
import { Controller, Endpoint, inject, reply } from '@navios/server'

import type { HandlerParams } from '@navios/server'

// getUser and UsersService come from the Quick start
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  }
}
```

Return a user without `email`, or answer with a status the declaration does not list, and the controller stops compiling.

## What it does

- **Typed handlers.** Parameters, return values and status codes are checked against the declaration at compile time, and validated again at run time.
- **Any schema library.** Every schema slot accepts a [Standard Schema](https://standardschema.dev): Zod, Valibot, ArkType and others. These docs use Zod in examples.
- **Standard decorators.** Navios uses TC39 decorators, the kind TypeScript compiles without `experimentalDecorators` and Bun runs natively.
- **Adapters.** The HTTP server is Fastify on Node.js and `Bun.serve` on Bun. On Cloudflare Workers, AWS Lambda and Deno an application runs with srvx. Application code is the same on all of them.
- **Singletons by default.** Controllers, guards and interceptors are created once at start-up. Per-request data travels in a typed request context, so nothing is constructed per request unless you ask for it.
- **One error format.** Every error response the framework produces is `application/problem+json`, unless the endpoint declares its own body for that status.
- **Dependency injection.** Services are wired by [`@navios/di`](/docs/di/), which `@navios/server` re-exports.

## Packages

| Package                   | What it is                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `@navios/server`          | The framework: controllers, modules, guards, interceptors, errors, config, logger               |
| `@navios/builder`         | Endpoint declarations, shared with clients                                                      |
| `@navios/adapter-fastify` | [Fastify adapter](/docs/server/adapters/fastify) for Node.js                                    |
| `@navios/adapter-bun`     | [Bun adapter](/docs/server/adapters/bun)                                                        |
| `@navios/adapter-srvx`    | [srvx adapter](/docs/server/adapters/srvx) for Workers, Lambda and Deno                         |
| `@navios/adapter-xml`     | [XML responses](/docs/server/adapters/xml) written as JSX                                       |
| `@navios/jwt`             | [Signing and verifying JSON Web Tokens](/docs/server/guides/authentication)                     |
| `@navios/better-auth`     | [Better Auth](/docs/server/guides/better-auth): sign-up, sessions and OAuth. Not published yet  |
| `@navios/schedule`        | [Cron jobs](/docs/server/guides/scheduled-jobs)                                                 |
| `@navios/microservice`    | [Message handlers](/docs/server/guides/other-transports#messages) on a queue. Not published yet |
| `@navios/openapi`         | [An OpenAPI document](/docs/server/guides/openapi) generated from the routes                    |
| `@navios/otel`            | [OpenTelemetry](/docs/server/opentelemetry/) traces and metrics                                 |

An application needs `@navios/server`, `@navios/builder` and one adapter. The rest are optional. They run on Node.js 24 or newer, and on Bun 1.4.5 or newer; the srvx adapter adds Cloudflare Workers, AWS Lambda and Deno.

## Who it is for

Navios Server fits a team that writes both sides of an API in TypeScript and wants a change to the contract to be a compile error on each side. It also works as a plain server framework: the declarations are useful on their own as the single description of every route, and they feed the OpenAPI document.

If you come from NestJS, the vocabulary is familiar (modules, controllers, guards, interceptors, injectable services) and the differences are listed in [Migrating from NestJS](/docs/server/reference/migrating-from-nestjs).

## Where to go

| You want to…                                 | Read                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| get a server running                         | [Quick start](/docs/server/quick-start)                                                   |
| see what happens to a request, in order      | [How a request is handled](/docs/server/request-lifecycle)                                |
| learn the everyday API in order              | Essentials, starting with [Controllers and handlers](/docs/server/essentials/controllers) |
| declare endpoints                            | [Declaring endpoints](/docs/builder/essentials/endpoints) in the Builder docs             |
| share declarations between client and server | [Sharing with Navios Server](/docs/builder/guides/navios-server)                          |
| authenticate requests                        | [Authentication with JWT](/docs/server/guides/authentication)                             |
| sign users up and in, with sessions          | [Better Auth](/docs/server/guides/better-auth)                                            |
| test an application                          | [Testing](/docs/server/essentials/testing)                                                |
| upgrade from 1.x                             | [Migrating to 2.0](/docs/server/reference/migrating-to-2)                                 |
