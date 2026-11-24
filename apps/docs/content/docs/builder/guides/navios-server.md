---
title: Sharing with Navios Server
---

# Sharing with Navios Server

A declaration describes an endpoint without saying which side of the wire you are on. The client calls it; a Navios server implements it. When both import the same declaration, a change to the contract is a compile error on whichever side has not caught up.

This page shows how to arrange that. The server's own behavior is documented in the [Controllers](/docs/server/guides/controllers) guide.

## Put declarations where both sides can import them

Declarations need a home that neither the client nor the server owns: a workspace package in a monorepo, or a shared folder.

```
packages/
  api-contract/     declarations and schemas, no client
  web/              imports the contract, provides an HTTP client
  server/           imports the contract, implements it
```

The contract creates its builder **without** a client, because only the calling side needs one.

```ts title="packages/api-contract/src/api.ts"
import { builder } from '@navios/builder'

export const API = builder()
```

```ts title="packages/api-contract/src/users.ts"
import { z } from 'zod/v4'

import { API } from './api'

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
```

## On the client

The client app supplies the HTTP client once, at start-up, and then calls the endpoints.

```ts title="packages/web/src/main.ts"
import { API } from '@acme/api-contract'
import { create } from '@navios/http'

API.provideClient(create({ baseURL: import.meta.env.VITE_API_URL }))
```

## On the server

A controller method is bound to a declaration with `@Endpoint`. The route, the validation and the handler's types all come from it.

```ts title="packages/server/src/user.controller.ts"
import { getUser } from '@acme/api-contract'
import { Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'

import type { EndpointParams } from '@navios/core'

import { UserService } from './user.service'

@Controller()
export class UserController {
  private users = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.users.findById(params.urlParams.userId)
  }
}
```

The server never calls the endpoint function, so it does not need an HTTP client. It reads `getUser.config`.

:::info
`EndpointParams` here is imported from `@navios/core`, not from `@navios/builder`. The two share a name but describe different sides: Builder's is what a caller passes, core's is what a handler receives.
:::

## What each side sees

The same schemas produce different types on each side, because each side is on a different end of the validation.

|                    | Client (caller)                         | Server (handler)                              |
| ------------------ | --------------------------------------- | --------------------------------------------- |
| `urlParams`        | `string \| number`, or the schema input | `string`, or the schema output                |
| `params`, `data`   | schema **input**                        | schema **output**, already validated          |
| response           | receives schema **output**              | returns schema **input**                      |
| per-call options   | `headers`, `timeout`, `signal`          | none                                          |

In practice: a query schema with `page: z.coerce.number().default(1)` lets the client omit `page`, and the handler always receives a number.

Both sides validate. The client checks its input before sending and the response after receiving; the server checks the incoming request before your handler runs. A request built by something other than your client is still held to the contract.

## Declarations that are not plain JSON

The server uses a different decorator depending on the declaration's `body` and `response`:

| Declaration                                   | Server decorator                                    |
| --------------------------------------------- | --------------------------------------------------- |
| JSON, `response: 'void'`, or `responses`      | [`@Endpoint`](/docs/server/guides/controllers)      |
| `body: 'multipart'`                           | [`@Multipart`](/docs/server/advanced/multipart)     |
| `response: 'blob'`, `'text'` or `'stream'`    | [`@Stream`](/docs/server/advanced/streaming)        |

Using the wrong one is a type error and fails at start-up.

## Schema libraries on the server

Builder accepts any Standard Schema in every slot. `@navios/core` is moving to the same model, but today its controllers, adapters and OpenAPI generation read Zod schemas directly.

:::warning
For now, a declaration that a Navios server implements must use Zod in every schema slot. Declarations that are only ever called from a client can use any Standard Schema library.
:::

## Keep the contract free of side concerns

A contract that both sides import should contain only what both sides agree on:

- **No client.** The builder is created bare; each consumer wires its own.
- **No environment access.** Base URLs and tokens belong to the app that makes the calls.
- **No browser-only or server-only imports**, or one side will fail to build. `z.instanceof(File)` in an upload schema is fine on runtimes that define `File`, which includes current Node.js and Bun.

[Organizing an API](/docs/builder/guides/organizing) covers how to lay out the declarations themselves.
