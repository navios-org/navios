---
title: Quick start
---

# Quick start

This page builds a small users API and runs it on Fastify. The declarations, the service, the controller and the module written here are the example the rest of the Server docs build on.

## Install

```bash
npm install @navios/server@next @navios/builder@next @navios/adapter-fastify@next fastify zod
```

:::info
2.0 is an alpha, published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.
:::

`@navios/builder` declares endpoints and `zod` is the schema library used in these docs; any [Standard Schema](https://standardschema.dev) library works in its place. `@navios/core` and `@navios/di` come with the server.

Node.js 24 or newer is required, or Bun 1.4.5 or newer.

Navios uses standard (TC39) decorators. Leave `experimentalDecorators` off in `tsconfig.json`. A project that has to keep it on uses the [legacy decorators](/docs/server/reference/legacy-decorators) entry point instead.

## Declare the API

These are the endpoints from the [Builder quick start](/docs/builder/quick-start), with two additions the server uses: `getUser` declares the body of its 404, and `createUser` declares that it answers 201.

```ts title="api.mts"
import { builder } from '@navios/builder'

export const API = builder()
```

```ts title="users.mts"
import { z } from 'zod/v4'

import { API } from './api.mjs'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responses: { 201: userSchema },
})
```

The builder has no HTTP client here, because a server never calls its own endpoints. When a client shares these files it supplies one; see [Sharing with Navios Server](/docs/builder/guides/navios-server).

## Write a service

A service is a class marked `@Injectable()`. This one keeps users in memory.

```ts title="users.service.mts"
import { Injectable } from '@navios/server'

import type { z } from 'zod/v4'

import type { userSchema } from './users.mjs'

type User = z.output<typeof userSchema>

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>([
    ['1', { id: '1', name: 'Ada', email: 'ada@example.com' }],
  ])
  private nextId = 2

  findById(id: string) {
    return this.users.get(id) ?? null
  }

  create(input: Omit<User, 'id'>) {
    const user = { id: String(this.nextId++), ...input }
    this.users.set(user.id, user)
    return user
  }
}
```

## Write a controller

A controller is a class whose methods implement declarations. `@Endpoint(getUser)` binds a method to an endpoint, `HandlerParams<typeof getUser>` types its argument, and `inject()` gives it the service.

```ts title="users.controller.mts"
import { Controller, Endpoint, inject, reply } from '@navios/server'

import type { HandlerParams } from '@navios/server'

import { createUser, getUser } from './users.mjs'
import { UsersService } from './users.service.mjs'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, this.users.create(data))
  }
}
```

A plain return value is sent with status 200. `reply(status, body)` answers with another status the declaration lists; one it does not list is a compile error.

## Group routes in a module

```ts title="app.module.mts"
import { Module } from '@navios/server'

import { UsersController } from './users.controller.mjs'

@Module({ controllers: [UsersController] })
export class AppModule {}
```

The service is not listed anywhere. An `@Injectable()` class is resolvable as soon as something injects it.

## Start the server

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

const url = await app.listen({ port: 3000 })
console.log(`Listening on ${url}`)
```

```bash
npx tsx main.mts
```

### On Bun

The same code runs on Bun. Install `@navios/adapter-bun@next` instead of the Fastify packages and change two lines of `main.mts`:

```ts title="main.mts"
import { defineBunEnvironment } from '@navios/adapter-bun'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})
```

```bash
bun main.mts
```

### On other runtimes

[`@navios/adapter-srvx`](/docs/server/adapters/srvx) runs the same code on Node.js, Deno and Bun, and on runtimes that call a `fetch` handler, such as Cloudflare Workers.

## Try it

```bash
curl http://localhost:3000/users/1
# 200 {"id":"1","name":"Ada","email":"ada@example.com"}

curl http://localhost:3000/users/9
# 404 {"message":"User not found"}

curl -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace","email":"grace@example.com"}'
# 201 {"id":"2","name":"Grace","email":"grace@example.com"}

curl -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace","email":"nope"}'
# 400 application/problem+json
# {"type":"about:blank","title":"Bad Request","status":400,
#  "detail":"Request validation failed for body","source":"body",
#  "errors":[{"path":"email","message":"Invalid email address"}]}
```

The last request never reached the controller. The body failed `requestSchema`, and the server answered in its standard [error format](/docs/server/essentials/errors).

## Next

- [How a request is handled](/docs/server/request-lifecycle) shows every stage between the socket and your handler.
- [Controllers and handlers](/docs/server/essentials/controllers) starts the tour of the everyday API.
- [Testing](/docs/server/essentials/testing) runs this application in a test without opening a port.
