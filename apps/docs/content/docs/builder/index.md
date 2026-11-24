---
title: Introduction
---

# Navios Builder

`@navios/builder` turns a description of an HTTP endpoint — method, URL, schemas — into a typed function that validates what it sends and what it receives. You write the description once and use it from the browser, from a Navios server controller and from React Query hooks.

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod/v4'

const API = builder({ client: create({ baseURL: 'https://api.example.com' }) })

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})

const user = await getUser({ urlParams: { userId: '42' } })
//    ^? { id: string; name: string }
```

## One declaration, three places

The value `getUser` is the contract. Everything else is derived from it.

**Call it** from any TypeScript code:

```ts
const user = await getUser({ urlParams: { userId: '42' } })
```

**Implement it** in a Navios server controller. The handler's parameters and return type come from the same declaration:

```ts
import { Controller, Endpoint } from '@navios/core'

import type { EndpointParams } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return { id: params.urlParams.userId, name: 'Ada' }
  }
}
```

**Use it** as a React Query hook:

```tsx
import { declareClient } from '@navios/react-query'

const client = declareClient({ api: API })
const userQuery = client.query(getUser)

function UserName({ userId }: { userId: string }) {
  const { data } = userQuery.use({ urlParams: { userId } })
  return <span>{data?.name}</span>
}
```

Change the response schema and all three stop compiling until they agree again.

## What you get

- **Inferred types.** Arguments, results and error bodies are inferred from the URL template and the schemas. You never write a request or response type by hand.
- **Validation on both sides of the wire.** Input is checked before a request is sent; the response is checked before your code sees it.
- **One error type.** Every failed call is an `EndpointError` with a `kind` you can switch on. Let it throw, or call `.safe()` and receive it as a value.
- **Your schema library.** Every schema slot accepts any [Standard Schema](https://standardschema.dev) implementation: Zod, Valibot, ArkType and others. These docs use Zod in examples.
- **Your HTTP client.** `@navios/http`, axios, or a ten-line `fetch` wrapper.
- **More than JSON.** Multipart uploads, file downloads, text, streams and empty replies come from the same `declareEndpoint`. WebSocket and Server-Sent Events have their own typed builders.

## Where to go

| You want to…                                          | Read                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| get an endpoint working                               | [Quick start](/docs/builder/quick-start)                          |
| understand the model first                            | [How it works](/docs/builder/how-it-works)                        |
| learn the everyday API in order                       | Essentials, starting with [Declaring endpoints](/docs/builder/essentials/endpoints) |
| find out why a call failed                            | [Errors](/docs/builder/essentials/errors)                         |
| share declarations with a Navios server               | [Sharing with Navios Server](/docs/builder/guides/navios-server)  |
| use endpoints in React components                     | [React Query](/docs/builder/react-query/)                         |
| look up an option, type or export                     | [API reference](/docs/builder/reference/builder)                  |
| upgrade from 1.x                                      | [Migrating to 2.0](/docs/builder/reference/migrating-to-2)        |
