---
sidebar_position: 4
---

# Custom Handlers

`declareEndpoint` covers most needs. When you want behaviour on top of it — transformed data, extra headers on every request, retries, a client resolved at call time — compose it from plain functions and the low-level utilities Builder exports.

## Choosing the Right Layer

| You want to...                                   | Use                                              |
| ------------------------------------------------ | ------------------------------------------------ |
| Reshape the response data                        | `.transform()` on the `responseSchema`           |
| Add fixed headers or a timeout to one endpoint   | The endpoint's `headers` / `timeout` options     |
| Change every outgoing request                    | A wrapped HTTP client                            |
| Add behaviour around a call (retry, cache, log)  | A function that wraps the endpoint               |
| Resolve the HTTP client dynamically              | `createHandler` with your own context            |

## Transforming Responses

Zod transforms run as part of response validation, and the endpoint's return type follows the transform's output:

```typescript
const userSchema = z
  .object({
    id: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    created_at: z.string(),
  })
  .transform((user) => ({
    id: user.id,
    fullName: `${user.first_name} ${user.last_name}`,
    createdAt: new Date(user.created_at),
  }))

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const user = await getUser({ urlParams: { userId: '123' } })
// user: { id: string; fullName: string; createdAt: Date }
```

The same applies to `requestSchema` and `querySchema`: the caller passes the schema's input type and the transformed output is what gets sent.

## Wrapping the Client

A client is an object with a `request` method, so decorating one takes a few lines. Every endpoint of the builder then goes through the wrapper:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'

import type { Client } from '@navios/builder'

function withRequestId(client: Client): Client {
  return {
    request: (config) =>
      client.request({
        ...config,
        headers: { ...config.headers, 'X-Request-ID': crypto.randomUUID() },
      }),
  }
}

const API = builder({
  client: withRequestId(create({ baseURL: 'https://api.example.com' })),
})
```

## Wrapping an Endpoint

An endpoint is a function, and `EndpointParams` / `EndpointResult` give you its argument and result types:

```typescript
import type { EndpointParams, EndpointResult } from '@navios/builder'

const cache = new Map<string, EndpointResult<typeof getUser>>()

async function getUserCached(args: EndpointParams<typeof getUser>) {
  const key = String(args.urlParams.userId)

  const cached = cache.get(key)
  if (cached) return cached

  const user = await getUser(args)
  cache.set(key, user)
  return user
}
```

A wrapper that works for any endpoint can be built on `safe()`, which reports every failure as a value:

```typescript
import type { EndpointError, SafeResult } from '@navios/builder'

async function retry<TData, TError extends EndpointError>(
  call: () => Promise<SafeResult<TData, TError>>,
  attempts = 3,
): Promise<SafeResult<TData, TError>> {
  let result = await call()
  for (let attempt = 1; attempt < attempts && !result.ok; attempt++) {
    if (result.error.kind !== 'network' && result.error.kind !== 'timeout') break
    result = await call()
  }
  return result
}

const result = await retry(() => getUser.safe({ urlParams: { userId: '123' } }))
```

## Low-Level API

### createHandler

`createHandler(options, context)` is the function behind `declareEndpoint`. It takes the endpoint options and a `BuilderContext` — where the client comes from and the builder configuration — and returns the handler with `safe` and `config` attached.

Supplying your own context lets you decide, at call time, which client an endpoint uses:

```typescript
import { createHandler } from '@navios/builder'

import type { BuilderContext, EndpointHandler } from '@navios/builder'

const context: BuilderContext = {
  getClient: () => clientForCurrentTenant(),
  config: {
    onError: (error) => logger.warn(error.toJSON()),
  },
}

const options = {
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
} as const

const getUser = createHandler(options, context) as EndpointHandler<typeof options>
```

`createHandler` is loosely typed; the cast to `EndpointHandler` restores the inference `declareEndpoint` gives you.

### bindUrlParams and getUrlParamNames

```typescript
import { bindUrlParams, getUrlParamNames } from '@navios/builder'

getUrlParamNames('/users/$userId/posts/$postId')
// ['userId', 'postId']

bindUrlParams('/users/$userId/posts/$postId', {
  urlParams: { userId: '123', postId: '456' },
})
// '/users/123/posts/456'
```

`bindUrlParams` URL-encodes the values, throws when a parameter is missing, and accepts a `urlParamsSchema` as its third argument to validate first. Combined with `endpoint.config.url` it builds links from the same templates your endpoints use:

```typescript
const href = bindUrlParams(getUser.config.url, { urlParams: { userId: '123' } })
```

### makeConfig

`makeConfig(request, options, finalUrl)` builds the request configuration the builder hands to the HTTP client: it validates `params` and `data` with the endpoint's schemas, converts `data` to `FormData` for multipart endpoints, and merges headers, timeout and `clientOptions`.

```typescript
import { bindUrlParams, makeConfig } from '@navios/builder'

const args = { urlParams: { userId: '123' }, data: { name: 'Jane' } }

const url = bindUrlParams(updateUser.config.url, args)
const config = makeConfig(args, updateUser.config, url)
// { method: 'PUT', url: '/users/123', params: {}, data: { name: 'Jane' } }
```

Both functions throw a `ZodError` when validation fails; an endpoint call turns that into an `EndpointError` of kind `request-validation`.

## Best Practices

### Prefer the Highest Layer That Works

```typescript
// ✅ Good - a schema transform keeps the endpoint self-describing
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema.transform(toUserView),
})

// ❌ Unnecessary - a hand-built handler for something a schema can express
const getUser = createHandler(/* ... */)
```

### Keep Wrappers Transparent

A wrapper that keeps the endpoint's argument and result types (`EndpointParams`, `EndpointResult`, `SafeResult`) can be swapped in and out without touching its callers.

## Next Steps

- [HTTP Client Setup](/docs/builder/builder/guides/http-client) - The client contract
- [Error Handling](/docs/builder/builder/guides/error-handling) - `EndpointError` and `safe()`
- [API Reference](/docs/builder/builder/api-reference) - Complete API documentation
