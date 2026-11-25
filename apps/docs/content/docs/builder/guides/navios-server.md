---
title: Sharing with Navios Server
---

# Sharing with Navios Server

A declaration describes an endpoint without saying which side of the wire you are on. The client calls it; a Navios server implements it. When both import the same declaration, a change to the contract is a compile error on whichever side has not caught up.

This page shows how to arrange that. The server's own behavior is documented in [Controllers and handlers](/docs/server/essentials/controllers).

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
import { Controller, Endpoint, inject, reply } from '@navios/server'

import type { HandlerParams } from '@navios/server'

import { UserService } from './user.service.mjs'

@Controller()
export class UserController {
  private readonly users = inject(UserService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    const user = await this.users.findById(urlParams.userId)
    return user ?? reply(404, { message: 'User not found' })
  }
}
```

The server never calls the endpoint function, so it does not need an HTTP client. It reads `getUser.config`.

`HandlerParams<typeof getUser>` is the server-side counterpart of Builder's `EndpointParams`: it describes what a handler receives, where `EndpointParams` describes what a caller passes. The handler's return value is checked too. Returning a user that does not match `userSchema`, or `reply()` with a status the declaration does not list, is a compile error.

## What each side sees

The same schemas produce different types on each side, because each side is on a different end of the validation.

|                    | Client (caller)                           | Server (handler)                     |
| ------------------ | ----------------------------------------- | ------------------------------------ |
| `urlParams`        | `string \| number`, or the schema input   | `string`, or the schema output       |
| `params`, `data`   | passes, and sends, the schema **input**   | schema **output**, already validated |
| response           | receives schema **output**                | returns schema **input**             |
| per-call options   | `headers`, `timeout`, `signal`            | none                                 |

In practice: a query schema with `page: z.number().default(1)` lets the client omit `page`, and the handler always receives a number.

Both sides validate. The client checks its input before sending and the response after receiving; the server checks the incoming request before your handler runs. A request built by something other than your client is still held to the contract.

### Requests: the input travels

The client validates what you pass and then sends it unchanged. Defaults, transforms and the removal of unknown keys happen on the server only, so each of them runs once. A transform may therefore turn its input into anything: the handler receives its output.

`builder({ send: 'output' })` sends what the schemas produced instead, and is meant for other APIs. With a Navios server it would apply every transform twice. [What is sent](/docs/builder/essentials/inputs#what-is-sent) compares the two.

### Query strings, URL parameters and form fields

They travel as text. The server decodes the text with the schema's JSON Schema before it validates, so a contract declares the types the handler wants: `z.number()`, `z.int()`, `z.boolean()`, `z.array(...)` and `z.object(...)` in a `querySchema`, a `urlParamsSchema` or a multipart `requestSchema` need no coercion, and the client is typed with them.

This works with schema libraries that implement Standard JSON Schema, as Zod 4 does. With a library that does not, describe the text itself. Never use `z.coerce.boolean()`: it turns `"false"` into `true`.

### Responses: the output travels

The server sends the output of the response schema, which is how fields the contract does not mention are removed, and the client parses that JSON with the same schema again. A `responseSchema`, an entry of `responses` or `errorSchema`, and the `payloadSchema` of an event must therefore accept their own output as JSON. [Responses in a shared contract](/docs/builder/essentials/schemas#responses-in-a-shared-contract) shows what that allows.

With `validateResponse: false` the client receives what the server sent, the schema's output in JSON form, while the type is the schema's input. Use it only with a schema for which the two are the same.

### Errors

A Navios server reports its own failures, such as a guard that denies access or input that fails validation, as problem details: JSON with the content type `application/problem+json`. Describe them in `errorSchema` like any other error body:

```ts
errorSchema: {
  403: z.object({ title: z.string(), detail: z.string().optional() }),
}
```

## Declarations that are not plain JSON

`@Endpoint` implements every kind of declaration. What changes with `body` and `response` is what the handler receives and returns:

| Declaration                                | Handler                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| JSON with `responseSchema`                 | returns the body                                                                         |
| `responses`, `errorSchema`                 | returns [`reply(status, body)`](/docs/server/essentials/controllers#declared-statuses)   |
| `response: 'void'`                         | returns nothing                                                                          |
| `body: 'multipart'`                        | receives fields and `File` objects in `data`; see [File uploads](/docs/server/guides/file-uploads) |
| `response: 'blob'`, `'text'` or `'stream'` | returns bytes, text or a stream; see [Streams and server-sent events](/docs/server/guides/streams-and-sse) |

A handler that returns the wrong thing for its declaration is a type error.

## Keep the contract free of side concerns

A contract that both sides import should contain only what both sides agree on:

- **No client.** The builder is created bare; each consumer wires its own.
- **No environment access.** Base URLs and tokens belong to the app that makes the calls.
- **No browser-only or server-only imports**, or one side will fail to build. `z.instanceof(File)` in an upload schema is fine on runtimes that define `File`, which includes current Node.js and Bun.

[Organizing an API](/docs/builder/guides/organizing) covers how to lay out the declarations themselves.
