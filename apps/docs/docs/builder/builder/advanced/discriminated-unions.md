---
sidebar_position: 3
---

# Discriminated Unions

Discriminated unions in your `responseSchema` let you model APIs that return different shapes based on a tag field. This is a Zod feature, not a builder-level mode — it works on every endpoint regardless of `result` mode.

If you instead want to discriminate **error responses by HTTP status code**, see [Error Handling](/docs/builder/builder/guides/error-handling) for the envelope mode + `errorSchema` flow.

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

## Discriminated Unions vs `errorSchema` + Envelope Mode

In v1, the `useDiscriminatorResponse: true` builder flag re-routed error responses through `responseSchema`, encouraging APIs to embed success and error in one discriminated union. **That flag was removed in v2.** Today the choice is:

### Use a `responseSchema` discriminated union when

- The success body itself has multiple shapes
- The discriminator is a field inside the 2xx response body
- You don't need access to the HTTP status, headers, or the network-layer error path

### Use envelope mode + `errorSchema` when

- The discriminator is the HTTP status code
- Different statuses carry different body shapes
- You want one place to catch validation, network, and HTTP errors

```typescript
import { isHttpError } from '@navios/builder'

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema, // 2xx
  errorSchema: {
    400: z.object({ error: z.string(), field: z.string() }),
    404: z.object({ error: z.literal('Not Found') }),
    500: z.object({ error: z.string() }),
  },
  result: 'envelope',
})

const { data, error } = await getUser({ urlParams: { userId: '123' } })

if (isHttpError(error, 404)) {
  console.log('Not found')
} else if (isHttpError(error, 400)) {
  console.log('Bad request:', error.body.field)
} else if (!error) {
  console.log('User:', data.name)
}
```

### Side-by-side

| Concern                | `responseSchema` union          | Envelope mode + `errorSchema`                |
|------------------------|---------------------------------|----------------------------------------------|
| Discriminator          | Field in the body               | HTTP status code                             |
| Status access          | Not exposed on the body         | `error.status`, plus full `response` meta    |
| Errors as data         | Yes (no throwing)               | Yes (no throwing)                            |
| Unmodeled error status | Lands as a Zod validation throw | Surfaces as the `http-unknown` variant       |
| Network failure        | Throws                          | Surfaces as the `network` variant            |

The v1 `__status` injection, `isErrorStatus`, `isErrorResponse`, and `UnknownResponseError` are removed in v2; envelope mode replaces them.

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

### Prefer Envelope Mode for HTTP-Status-Based Errors

If your only motivation for a `responseSchema` discriminated union is "I want errors to come back as data rather than throw," switch to envelope mode. The envelope already gives you `data | error` discrimination with the full HTTP `response` attached, no extra schema modeling needed.

## Next Steps

- [Error Handling](/docs/builder/builder/guides/error-handling) - The unified `onError(event)` hook plus envelope mode
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Zod schema essentials
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Endpoint basics
