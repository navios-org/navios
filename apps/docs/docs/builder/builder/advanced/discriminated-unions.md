---
sidebar_position: 3
---

# Discriminated Unions

Discriminated unions allow you to handle APIs that return different response shapes based on a common discriminator field. This is useful for APIs that include both success and error cases in the same response type.

## When to Use

Use discriminated unions when:
- Your API returns different response shapes based on a status field
- You want to handle success and error cases in the same type
- You need type-safe narrowing based on a discriminator field

## Basic Example

```typescript
const API = builder({ useDiscriminatorResponse: true })

const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
])

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema,
})

// Usage - TypeScript narrows the type automatically
const result = await getUser({ urlParams: { userId: '123' } })

if (result.status === 'success') {
  console.log(result.data) // TypeScript knows this is User
} else {
  console.error(result.error) // TypeScript knows this is string
}
```

## Configuration

Enable discriminated union support when creating the builder:

```typescript
const API = builder({
  useDiscriminatorResponse: true, // Enable discriminated union parsing
})
```

When enabled, error responses (non-2xx status codes) will be parsed using the same `responseSchema` as success responses, allowing discriminated unions to handle both cases.

## Multiple Response Types

### Success and Error

```typescript
const API = builder({ useDiscriminatorResponse: true })

const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    code: z.string().optional(),
  }),
])

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema,
})
```

### Multiple Success Types

```typescript
const responseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user'),
    data: userSchema,
  }),
  z.object({
    type: z.literal('admin'),
    data: adminSchema,
  }),
  z.object({
    type: z.literal('guest'),
    data: guestSchema,
  }),
])

const getAccount = API.declareEndpoint({
  method: 'GET',
  url: '/accounts/$accountId',
  responseSchema,
})

// Usage
const account = await getAccount({ urlParams: { accountId: '123' } })

switch (account.type) {
  case 'user':
    // TypeScript knows account.data is User
    console.log(account.data.name)
    break
  case 'admin':
    // TypeScript knows account.data is Admin
    console.log(account.data.permissions)
    break
  case 'guest':
    // TypeScript knows account.data is Guest
    console.log(account.data.limitedAccess)
    break
}
```

## Type Narrowing

TypeScript automatically narrows types based on the discriminator:

```typescript
const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
])

const result = await getUser({ urlParams: { userId: '123' } })

// TypeScript narrows based on status
if (result.status === 'success') {
  // result.data is available and typed as User
  const user = result.data
  console.log(user.name)
} else {
  // result.error is available and typed as string
  console.error(result.error)
}
```

## Error Handling

With discriminated unions, you don't need try-catch for error responses:

```typescript
// ✅ Good - no try-catch needed
const result = await getUser({ urlParams: { userId: '123' } })

if (result.status === 'error') {
  // Handle error case
  showError(result.error)
  return
}

// Handle success case
displayUser(result.data)
```

Without discriminated unions, you'd need:

```typescript
// ❌ More verbose
try {
  const user = await getUser({ urlParams: { userId: '123' } })
  displayUser(user)
} catch (error) {
  if (error instanceof NaviosError) {
    showError(error.message)
  }
}
```

## Complex Examples

### Paginated Response with Error

```typescript
const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.object({
      users: z.array(userSchema),
      total: z.number(),
      page: z.number(),
    }),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    code: z.enum(['INVALID_PAGE', 'INVALID_LIMIT', 'SERVER_ERROR']),
  }),
])

const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema,
})

// Usage
const result = await getUsers({ params: { page: 1, limit: 20 } })

if (result.status === 'success') {
  console.log(`Found ${result.data.total} users`)
  result.data.users.forEach((user) => {
    console.log(user.name)
  })
} else {
  switch (result.code) {
    case 'INVALID_PAGE':
      console.error('Invalid page number')
      break
    case 'INVALID_LIMIT':
      console.error('Invalid limit')
      break
    case 'SERVER_ERROR':
      console.error('Server error:', result.error)
      break
  }
}
```

### Mutation Response

```typescript
const createUserResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
    message: z.string().optional(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    field: z.string().optional(),
    code: z.enum(['VALIDATION_ERROR', 'DUPLICATE_EMAIL', 'SERVER_ERROR']),
  }),
])

const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: createUserResponseSchema,
})

// Usage
const result = await createUser({
  data: { name: 'John', email: 'john@example.com' },
})

if (result.status === 'success') {
  console.log('User created:', result.data)
  if (result.message) {
    showSuccess(result.message)
  }
} else {
  if (result.code === 'VALIDATION_ERROR' && result.field) {
    showFieldError(result.field, result.error)
  } else {
    showError(result.error)
  }
}
```

## Best Practices

### Use Descriptive Discriminator Values

```typescript
// ✅ Good - clear discriminator values
const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), error: z.string() }),
])

// ❌ Bad - unclear values
const responseSchema = z.discriminatedUnion('s', [
  z.object({ s: z.literal('ok'), d: userSchema }),
  z.object({ s: z.literal('err'), e: z.string() }),
])
```

### Include Error Codes

```typescript
// ✅ Good - includes error codes for better handling
const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    code: z.enum(['NOT_FOUND', 'VALIDATION_ERROR', 'SERVER_ERROR']),
  }),
])
```

### Use Type Guards

```typescript
function isSuccessResponse(
  response: SuccessResponse | ErrorResponse
): response is SuccessResponse {
  return response.status === 'success'
}

const result = await getUser({ urlParams: { userId: '123' } })

if (isSuccessResponse(result)) {
  // TypeScript knows result is SuccessResponse
  console.log(result.data)
} else {
  // TypeScript knows result is ErrorResponse
  console.error(result.error)
}
```

## Common Mistakes

### Forgetting useDiscriminatorResponse

```typescript
// ❌ Error responses won't be parsed
const API = builder() // Missing useDiscriminatorResponse: true

const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), error: z.string() }),
])

// Error responses will throw instead of being parsed
```

### Wrong Discriminator Field

```typescript
// ❌ Wrong - discriminator field doesn't match
const responseSchema = z.discriminatedUnion('type', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), error: z.string() }),
])
// Should use 'status' as discriminator
```

## Next Steps

- [Error Handling](/docs/builder/builder/guides/error-handling) - More error handling patterns
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Learn about Zod schemas
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint basics

