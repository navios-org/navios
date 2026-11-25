---
title: URL params, query and body
---

# URL params, query and body

An endpoint call takes one object with up to three inputs: `urlParams`, `params` and `data`. This page covers how each is declared, typed and validated, and which request options a call accepts beside them.

All three are validated before anything is sent. If one fails, the call ends with an `EndpointError` of kind `request-validation` and no request is made.

## URL parameters

A parameter is `$` followed by a letter or underscore, then letters, digits or underscores. The type system and the runtime apply the same rule, so `/files/$id.json` has one parameter, `id`.

```ts
export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

await getPost({ urlParams: { userId: '42', postId: 7 } })
// GET /users/42/posts/7
```

Without a schema, each value is `string | number`. Values are URL-encoded. A missing, `null` or empty-string value fails the call rather than producing a shorter path. So does a value that is exactly `.` or `..`, which URL parsing would resolve into a different path.

### Validating URL parameters

`urlParamsSchema` narrows the types and validates the values at runtime. The schema's output is what goes into the URL, so coercion and transforms apply.

```ts
export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  urlParamsSchema: z.object({
    userId: z.uuid(),
    postId: z.coerce.number().int().positive(),
  }),
  responseSchema: postSchema,
})
```

The schema's keys must be exactly the parameter names in the URL. With a Zod object schema a mismatch throws a `NaviosError` at declaration time, so you find out when the module loads instead of on the first call.

## Query parameters

Declare a `querySchema` and the call accepts `params`.

```ts
export const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1).default(1),
    search: z.string().optional(),
    role: z.enum(['admin', 'member']).optional(),
  }),
  responseSchema: z.array(userSchema),
})

await listUsers({ params: { search: 'ada', role: 'admin' } })
// GET /users?page=1&search=ada&role=admin
```

Builder validates `params` and hands the schema's output to the HTTP client as an object. Turning that object into a query string, including how arrays and nested values are written, is the client's job.

Defaults in the schema are applied before sending, as `page` shows above.

## Request body

Declare a `requestSchema` and the call accepts `data`. The validated output is sent as JSON.

```ts
export const updateUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: userSchema.omit({ id: true }).partial(),
  responseSchema: userSchema,
})

await updateUser({
  urlParams: { userId: '42' },
  data: { name: 'Ada Lovelace' },
})
```

To send `FormData` instead of JSON, add `body: 'multipart'`. See [File uploads](/docs/builder/guides/file-uploads).

## What is required

TypeScript requires an input exactly when the declaration makes it necessary:

- `urlParams` is required when the URL has parameters.
- `params` and `data` are required when their schema has at least one required field, and optional otherwise.
- The whole argument object is optional when nothing in it is required.

```ts
await listUsers() // every query field is optional or has a default
await listUsers({ params: { page: 2 } })
```

## Per-call request options

The same object accepts three options that are not validated by a schema:

| Option    | Effect                                                                |
| --------- | --------------------------------------------------------------------- |
| `headers` | Merged over the endpoint's `headers`                                  |
| `timeout` | Milliseconds; wins over the endpoint's `timeout`                      |
| `signal`  | An `AbortSignal`. Aborting it ends the call with kind `aborted`       |

```ts
const controller = new AbortController()

const pending = getUser({
  urlParams: { userId: '42' },
  signal: controller.signal,
  headers: { 'X-Trace': traceId },
})

controller.abort()
```

A second argument selects the HTTP client for one call. That is covered in [HTTP client](/docs/builder/essentials/http-client#a-client-for-one-call).
