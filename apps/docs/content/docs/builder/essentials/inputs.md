---
title: URL params, query and body
---

# URL params, query and body

An endpoint call takes one object with up to three inputs: `urlParams`, `params` and `data`. This page covers how each is declared, typed and validated, and which request options a call accepts beside them.

All three are validated before anything is sent. If any of them fails, the call ends with an `EndpointError` of kind `request-validation` that lists the problems of all three, and no request is made.

What is sent is the value you passed, not what the schema made of it. See [What is sent](#what-is-sent).

## URL parameters

A parameter is `$` followed by a letter or underscore, then letters, digits or underscores. Any other character ends the name, so the rest of the segment can be literal: `/files/$name.json` has one parameter, `name`, and `/carts/$id:checkout` has `id`. The type system and the runtime apply the same rule.

```ts
export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

await getPost({ urlParams: { userId: '42', postId: 7 } })
// GET /users/42/posts/7
```

Without a schema, each value is `string | number`. Values are URL-encoded, and a `Date` is written as an ISO string. A missing, `null` or empty-string value fails the call rather than producing a shorter path. So does a value that is exactly `.` or `..`, which URL parsing would resolve into a different path, and one that has no form in a URL: an object, an array or `NaN`. These calls fail with kind `config`.

### Validating URL parameters

`urlParamsSchema` narrows the types and validates the values at runtime.

```ts
export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  urlParamsSchema: z.object({
    userId: z.uuid(),
    postId: z.int().positive(),
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
// GET /users?search=ada&role=admin
```

Builder validates `params` and hands them to the HTTP client as an object. Turning that object into a query string, including how arrays and nested values are written, is the client's job. The `page` above was left out, so it is not in the URL: the default is applied by the server that parses the query.

A query string is text, but the schema does not have to be. `z.number()`, `z.int()`, `z.boolean()`, arrays and objects can be used as they are in a contract with a Navios server, which decodes the text with the schema's JSON Schema before it validates. That needs a schema library that implements [Standard JSON Schema](https://standardschema.dev/json-schema), as Zod 4 does. With a library that does not, describe the text a Navios server receives.

:::warning
Do not use `z.coerce.boolean()`. It turns every non-empty string into `true`, also `"false"`. `z.coerce.number()` is not needed either, and loses the type of what the client passes.
:::

## Request body

Declare a `requestSchema` and the call accepts `data`. It is sent as JSON, whatever its type: an object, an array, or a plain string, number, boolean or `null`.

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

To send `FormData` instead of JSON, add `body: 'multipart'`. See [File uploads](/docs/builder/guides/file-uploads). A `GET` or `HEAD` endpoint cannot have a body; declaring one is an error.

## What is sent

Builder validates the arguments of a call and then sends **what you passed**. The schema decides whether the request leaves, and the server that parses it with the same schema applies the rest:

- **Defaults** are filled in by the server. A field you leave out is not sent. A URL parameter you leave out is: the URL needs a value, so it is the default of `urlParamsSchema`.
- **Unknown keys** are removed by the server. A key the schema does not know, on an object you pass, is sent.
- **Transforms** run on the server, once.

```ts
const schema = z.object({
  tags: z.string().transform((tags) => tags.split(',')),
  limit: z.number().default(20),
})

await search({ data: { tags: 'a,b' } })
// body: {"tags":"a,b"}; the handler receives { tags: ['a', 'b'], limit: 20 }
```

So the input of a request schema is the format on the wire, which is also what [OpenAPI](/docs/server/guides/openapi) describes.

For an API that does not share your schemas, the schemas can describe the conversion to its format instead. Create the builder with `send: 'output'` and what the schemas produced is sent: transforms, defaults and the removal of unknown keys happen before the request.

```ts
export const legacyAPI = builder({ client, send: 'output' })

export const search = legacyAPI.declareEndpoint({
  method: 'POST',
  url: '/search',
  requestSchema: z
    .object({ tags: z.array(z.string()), limit: z.number().default(20) })
    .transform(({ tags, limit }) => ({ tag_list: tags.join(','), page_size: limit })),
  responseSchema: resultsSchema,
})

await search({ data: { tags: ['a', 'b'] } })
// body: {"tag_list":"a,b","page_size":20}
```

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
