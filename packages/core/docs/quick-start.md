# Quick start

This page builds a small HTTP API on the Fastify adapter. The same code runs on Bun by changing the adapter import.

## Install

```bash
yarn add @navios/core @navios/builder @navios/adapter-fastify fastify zod
```

`@navios/builder` declares endpoints. `zod` is used for schemas in these pages; any library that implements [Standard Schema](https://standardschema.dev) works.

Navios uses standard (TC39) decorators. Leave `experimentalDecorators` off in `tsconfig.json`. A project that must keep `experimentalDecorators` on uses the [legacy decorators](./legacy-decorators.md) entry point instead.

## Declare the API

An endpoint is declared once with the builder. The server reads the declaration to validate requests and responses, and a client can call the same declaration.

```ts
// api.mts
import { builder } from '@navios/builder'
import { z } from 'zod'

export const api = builder()

const userSchema = z.object({ id: z.string(), name: z.string() })

export const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

export const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string().min(1) }),
  responses: { 201: userSchema },
})
```

## Write a service

```ts
// users.service.mts
import { Injectable } from '@navios/core'

@Injectable()
export class UsersService {
  private readonly users = new Map([['1', { id: '1', name: 'Ann' }]])
  private next = 2

  find(id: string) {
    return this.users.get(id) ?? null
  }

  create(name: string) {
    const user = { id: String(this.next++), name }
    this.users.set(user.id, user)
    return user
  }
}
```

## Write a controller

A handler is a class field created with `handler()`. Its parameter and return types come from the declaration.

```ts
// users.controller.mts
import { Controller, handler, inject, reply } from '@navios/core'

import { createUser, getUser } from './api.mjs'
import { UsersService } from './users.service.mjs'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, ({ urlParams }) => {
    return this.users.find(urlParams.id) ?? reply(404, { message: 'User not found' })
  })

  createUser = handler(createUser, ({ data }) => reply(201, this.users.create(data.name)))
}
```

## Group routes in a module

```ts
// app.module.mts
import { Module } from '@navios/core'

import { UsersController } from './users.controller.mjs'

@Module({ controllers: [UsersController] })
export class AppModule {}
```

## Start the server

```ts
// main.mts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './app.module.mjs'

declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

const url = await app.listen({ port: 3000 })
console.log(`Listening on ${url}`)
```

The `declare module` block is optional. It tells TypeScript which adapter the application runs on, so that `ctx.raw` and `app.getServer()` are typed. See [Request context](./request-context.md#native-objects-ctxraw).

## Try it

```bash
curl http://localhost:3000/users/1
# {"id":"1","name":"Ann"}

curl http://localhost:3000/users/9
# 404 {"message":"User not found"}

curl -X POST http://localhost:3000/users -H 'content-type: application/json' -d '{"name":""}'
# 400 application/problem+json, with "source":"body" and an "errors" array
```

## Next

- [Controllers and handlers](./controllers.md)
- [Guards and interceptors](./guards-and-interceptors.md)
- [Testing](./testing.md)
