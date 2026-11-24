---
sidebar_position: 3
---

# Discriminated Unions

Discriminated unions in your `responseSchema` let you model APIs that return different shapes based on a tag field. This is a Zod feature and works on every endpoint.

If you instead want to discriminate **error responses by HTTP status code**, use `errorSchema` — see [Error Handling](/docs/builder/builder/guides/error-handling). If the **success body depends on the 2xx status** (`200` vs `201` vs `204`), use `responses` — see [Per-Status Responses](/docs/builder/builder/guides/defining-endpoints#per-status-responses).

## When to Use

Use a discriminated union in `responseSchema` when:

- Your API uses a tag field (e.g. `kind`, `type`, `status`) to switch between response shapes
- A single 2xx response can legitimately have multiple shapes
- You want TypeScript narrowing on a `responseSchema` field

## Basic Example

```typescript
const API = builder()

const responseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    data: userSchema,
  }),
  z.object({
    kind: z.literal('admin'),
    data: adminSchema,
  }),
])

const getAccount = API.declareEndpoint({
  method: 'GET',
  url: '/accounts/$accountId',
  responseSchema,
})

const account = await getAccount({ urlParams: { accountId: '123' } })

if (account.kind === 'user') {
  // TypeScript narrows account.data to User
  console.log(account.data.name)
} else {
  // TypeScript narrows account.data to Admin
  console.log(account.data.permissions)
}
```

## Multiple Variants

```typescript
const responseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), data: userSchema }),
  z.object({ type: z.literal('admin'), data: adminSchema }),
  z.object({ type: z.literal('guest'), data: guestSchema }),
])

const getAccount = API.declareEndpoint({
  method: 'GET',
  url: '/accounts/$accountId',
  responseSchema,
})

const account = await getAccount({ urlParams: { accountId: '123' } })

switch (account.type) {
  case 'user':
    console.log(account.data.name)
    break
  case 'admin':
    console.log(account.data.permissions)
    break
  case 'guest':
    console.log(account.data.limitedAccess)
    break
}
```

## Discriminated Unions vs `errorSchema`

Both give you a tagged value to branch on. Which one fits depends on where the tag lives.

### Use a `responseSchema` discriminated union when

- The success body itself has multiple shapes
- The discriminator is a field inside the 2xx response body

### Use `errorSchema` when

- The discriminator is the HTTP status code
- Different statuses carry different body shapes
- You want HTTP, validation and network failures in one place

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema, // 2xx
  errorSchema: {
    400: z.object({ error: z.string(), field: z.string() }),
    404: z.object({ error: z.literal('Not Found') }),
  },
})

const result = await getUser.safe({ urlParams: { userId: '123' } })

if (result.ok) {
  console.log('User:', result.data.name)
} else if (result.error.kind === 'http' && result.error.status === 404) {
  console.log('Not found')
} else if (result.error.kind === 'http' && result.error.status === 400) {
  console.log('Bad request:', result.error.body.field)
}
```

### Side-by-side

| Concern                | `responseSchema` union                    | `errorSchema`                                |
|------------------------|-------------------------------------------|----------------------------------------------|
| Discriminator          | Field in the body                         | `error.kind` and `error.status`              |
| Applies to             | 2xx responses                             | Non-2xx responses                            |
| Where the value lands  | The endpoint's data                       | `EndpointError` (thrown, or `result.error`)  |
| Unmodeled shape        | `response-validation` error               | `http-unknown` error with the raw body       |

## Mutation Example

```typescript
const createUserResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('created'),
    data: userSchema,
    message: z.string().optional(),
  }),
  z.object({
    status: z.literal('duplicate'),
    existingUserId: z.string(),
  }),
])

const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string(), email: z.string().email() }),
  responseSchema: createUserResponseSchema,
})

const result = await createUser({ data: { name: 'John', email: 'john@example.com' } })

if (result.status === 'created') {
  console.log('User created:', result.data)
} else {
  console.log('Already exists as', result.existingUserId)
}
```

## Best Practices

### Use Descriptive Discriminator Values

```typescript
// Good - clear discriminator values
const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), error: z.string() }),
])

// Bad - unclear values
const responseSchema = z.discriminatedUnion('s', [
  z.object({ s: z.literal('ok'), d: userSchema }),
  z.object({ s: z.literal('err'), e: z.string() }),
])
```

### Keep HTTP Errors in `errorSchema`

If the server signals a failure with a non-2xx status, model its body in `errorSchema` rather than in a `responseSchema` union: a non-2xx response never reaches `responseSchema`. To receive errors as data instead of exceptions, call the endpoint with `safe()`.

## Next Steps

- [Error Handling](/docs/builder/builder/guides/error-handling) - `EndpointError`, `safe()` and `errorSchema`
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Zod schema essentials
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Endpoint basics
