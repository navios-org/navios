---
title: Organizing an API
---

# Organizing an API

Declarations are ordinary exported values, so structuring them is mostly ordinary module design. This page collects the conventions that hold up as an API grows from five endpoints to a few hundred.

## One builder per backend

A builder is the unit that shares an HTTP client and an `onError` hook. Create it in its own module and import it wherever endpoints are declared.

```ts title="api/api.ts"
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder({
  client: create({ baseURL: import.meta.env.VITE_API_URL }),
  onError: (error) => {
    if (error.kind !== 'aborted') reportError(error.toJSON())
  },
})
```

Putting reporting in `onError` means individual call sites only handle the failures they can do something about.

## One module per resource

Group a resource's schemas and endpoints in one file. They change together, and a reader looking for "everything about users" finds it in one place.

```
api/
  api.ts          the builder
  users.ts        userSchema, getUser, listUsers, createUser, ...
  posts.ts        postSchema, getPost, listPosts, ...
  index.ts        re-exports
```

```ts title="api/users.ts"
import { z } from 'zod/v4'

import { API } from './api'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
})

const userInput = userSchema.omit({ id: true })
const userNotFound = { 404: z.object({ message: z.string() }) }

export const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number().default(1), search: z.string().optional() }),
  responseSchema: z.array(userSchema),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: userNotFound,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userInput,
  responseSchema: userSchema,
})

export const updateUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: userInput.partial(),
  responseSchema: userSchema,
  errorSchema: userNotFound,
})

export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
  errorSchema: userNotFound,
})
```

Two things in that file are worth copying:

- **Derive, do not restate.** `userInput` and its `.partial()` follow `userSchema` automatically.
- **Share error schemas.** An object such as `userNotFound` used by several endpoints keeps their error bodies identical.

## Name endpoints by what they do

Use a verb and the resource: `getUser`, `listUsers`, `createUser`, `updateUser`, `deleteUser`. The name is what appears at every call site and in every hook, so it matters more than the URL.

Name URL parameters after what they identify. `/users/$userId/posts/$postId` reads correctly at the call site; `/users/$id/posts/$id2` does not.

## Export types from declarations

When other code needs a type, derive it from the declaration instead of exporting a second, hand-written one.

```ts title="api/users.ts"
import type { EndpointParams, EndpointResult } from '@navios/builder'

export type User = EndpointResult<typeof getUser>
export type CreateUserArgs = EndpointParams<typeof createUser>
```

For a resource type used on its own, inferring from the schema is equivalent and sometimes clearer: `type User = z.output<typeof userSchema>`.

## Repeated shapes

When several endpoints share a shape, write a function that builds the schema.

```ts title="api/pagination.ts"
import { z } from 'zod/v4'

export const pageQuery = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const pageOf = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
  })
```

```ts
export const listPosts = API.declareEndpoint({
  method: 'GET',
  url: '/posts',
  querySchema: pageQuery,
  responseSchema: pageOf(postSchema),
})
```

Prefer this to a helper that wraps `declareEndpoint` itself. Wrappers tend to lose type inference, and a declaration that spells out its method, URL and schemas is easier to search for.

## Decide where failures are handled

A consistent rule keeps error handling from spreading through the codebase:

- **Report everything once**, in the builder's `onError`.
- **Declare `errorSchema` only for statuses you act on.** A 409 that becomes a form message deserves a schema. A 500 does not.
- **Use `.safe()` where a failure is an expected outcome**, and let the throwing form propagate everywhere else.

[Errors](/docs/builder/essentials/errors) has the API for each.

## When the server is yours too

If the same team owns the server, move the `api/` folder into a package both sides import, and create the builder without a client. [Sharing with Navios Server](/docs/builder/guides/navios-server) shows the layout.
