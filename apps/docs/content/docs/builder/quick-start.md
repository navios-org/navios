---
title: Quick start
---

# Quick start

This page takes you from an empty project to a typed endpoint call with a handled failure. The small users API declared here is the example the rest of the Builder docs build on.

## Install

```bash
npm install @navios/builder@next @navios/http@next zod
```

:::info
2.0 is an alpha, published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.
:::

`@navios/http` is a small `fetch`-based client and `zod` is the schema library used in these docs. Both are replaceable: see [HTTP client](/docs/builder/essentials/http-client) and [Schemas](/docs/builder/essentials/schemas).

## Create a builder

A builder holds the HTTP client and hands out endpoint functions. Most apps have one per backend.

```ts title="api.ts"
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})
```

## Declare endpoints

An endpoint is a method, a URL and the schemas that describe its data. `$userId` marks a URL parameter.

```ts title="users.ts"
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
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})
```

## Call them

Each declaration is an async function. Its argument object has up to three parts, and TypeScript requires exactly the ones the declaration implies:

- `urlParams` — values for the `$name` placeholders
- `params` — query string, when the endpoint has a `querySchema`
- `data` — request body, when it has a `requestSchema`

```ts
import { createUser, getUser } from './users'

const user = await getUser({ urlParams: { userId: '42' } })
user.email // string

const created = await createUser({
  data: { name: 'Ada', email: 'ada@example.com' },
})
```

Both calls validate on the way out and on the way in. If `email` is not an email, nothing is sent. If the server replies with a body that does not match `userSchema`, the call fails instead of handing you bad data.

## Handle a failure

A failed call throws an `EndpointError`. When you would rather branch than catch, call `.safe()`: it never throws and resolves to a result you narrow on `ok`.

```ts
const res = await getUser.safe({ urlParams: { userId: '42' } })

if (res.ok) {
  console.log(res.data.name)
} else if (res.error.kind === 'http-unknown' && res.error.status === 404) {
  console.log('No such user')
} else {
  console.error(res.error.kind, res.error.message)
}
```

`error.kind` tells you what went wrong: an HTTP status, invalid input, an invalid response, a network failure, a timeout and so on. [Errors](/docs/builder/essentials/errors) lists every kind and shows how to give error bodies a type.

## Next

- [How it works](/docs/builder/how-it-works) explains what happens during a call and when to use `.safe()`.
- [Declaring endpoints](/docs/builder/essentials/endpoints) starts the tour of everything a declaration can say.
- Using React? Continue with the [React Query quick start](/docs/builder/react-query/).
