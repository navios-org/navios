---
sidebar_position: 2
---

# URL Parameters

URL parameters allow you to create dynamic endpoints with type-safe parameter extraction. Builder automatically extracts parameters from your URL pattern and enforces them at the type level.

## Basic Syntax

Use `$paramName` syntax to define URL parameters:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// TypeScript requires userId
const user = await getUser({ urlParams: { userId: '123' } })
```

## Single Parameter

The simplest case is a single parameter:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Usage
const user = await getUser({ urlParams: { userId: '123' } })
```

TypeScript will error if you forget to provide `userId`:

```typescript
// ❌ Error: Property 'userId' is missing
await getUser({ urlParams: {} })
```

## Multiple Parameters

You can have multiple parameters in a single URL:

```typescript
const getUserPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

// Usage - all parameters are required
const post = await getUserPost({
  urlParams: {
    userId: '123',
    postId: '456',
  },
})
```

## Parameter Order

Parameters can appear anywhere in the URL:

```typescript
// At the start
const getOrgUser = API.declareEndpoint({
  method: 'GET',
  url: '/$orgId/users/$userId',
  responseSchema: userSchema,
})

// In the middle
const getUserSettings = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/settings/$settingId',
  responseSchema: settingsSchema,
})

// At the end
const getUserPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts',
  responseSchema: z.array(postSchema),
})
```

## Type Safety

Builder extracts parameter names at the type level, ensuring type safety:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// TypeScript knows the exact parameter names
type Params = Parameters<typeof getUser>[0]['urlParams']
// Params = { userId: string | number }
```

### Type Inference

The `urlParams` type is automatically inferred:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// TypeScript autocomplete works!
const user = await getUser({
  urlParams: {
    userId: '123', // ✅ Autocomplete suggests 'userId'
    // ❌ TypeScript error if you use wrong name
  },
})
```

## URL Parameter Schema Validation

For runtime validation and custom types, use `urlParamsSchema`:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
  urlParamsSchema: z.object({
    userId: z.string().uuid(), // Must be a valid UUID
    postId: z.coerce.number().int().positive(), // Coerced to positive integer
  }),
})

// This validates at runtime
await getUser({
  urlParams: {
    userId: '550e8400-e29b-41d4-a716-446655440000', // ✅ Valid UUID
    postId: '42', // ✅ Coerced to number 42
  },
})

// This throws a validation error at runtime
await getUser({
  urlParams: {
    userId: 'not-a-uuid', // ❌ Throws ZodError
    postId: '42',
  },
})
```

### Benefits of urlParamsSchema

1. **Runtime Validation**: Catch invalid URL parameters before making the request
2. **Type Coercion**: Use `z.coerce` to transform string values to other types
3. **Custom Validation**: Apply any Zod validation (UUID, email, regex, etc.)
4. **Better Types**: TypeScript infers types from the schema instead of defaulting to `string | number`

### Schema Must Match URL Parameters

The schema keys must match all `$paramName` patterns in the URL:

```typescript
// ✅ Correct - schema matches URL params
const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: schema,
  urlParamsSchema: z.object({
    userId: z.string(),
    postId: z.string(),
  }),
})

// ❌ Wrong - missing postId in schema
const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: schema,
  urlParamsSchema: z.object({
    userId: z.string(),
    // postId is missing!
  }),
})
```

### Common urlParamsSchema Patterns

```typescript
// UUID validation
urlParamsSchema: z.object({
  id: z.string().uuid(),
})

// Numeric ID with coercion
urlParamsSchema: z.object({
  id: z.coerce.number().int().positive(),
})

// Slug validation
urlParamsSchema: z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
})

// Date parameter
urlParamsSchema: z.object({
  date: z.string().date(), // YYYY-MM-DD format
})

// Enum validation
urlParamsSchema: z.object({
  status: z.enum(['active', 'inactive', 'pending']),
})
```

## Combining with Other Parameters

URL parameters work seamlessly with query parameters and request bodies:

```typescript
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId', // URL param
  querySchema: z.object({
    notify: z.boolean().optional(), // Query param
  }),
  requestSchema: z.object({
    name: z.string(), // Request body
  }),
  responseSchema: userSchema,
})

// Usage
const updated = await updateUser({
  urlParams: { userId: '123' },
  params: { notify: true },
  data: { name: 'Jane' },
})
```

## Type Utilities

You can extract URL parameter types for use elsewhere:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Extract parameter type
type UserId = Parameters<typeof getUser>[0]['urlParams']['userId']
// UserId = string

// Use in other functions
function validateUserId(userId: UserId): boolean {
  return userId.length > 0
}
```

## Best Practices

### Use Descriptive Names

```typescript
// ✅ Good - clear and descriptive
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Bad - unclear
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
})
```

### Keep URLs RESTful

```typescript
// ✅ Good - follows REST conventions
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Bad - action in URL for GET
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/get',
  responseSchema: userSchema,
})
```

### Group Related Endpoints

```typescript
// All user-related endpoints use $userId
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const getUserPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts',
  responseSchema: z.array(postSchema),
})

const getUserSettings = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/settings',
  responseSchema: settingsSchema,
})
```

## Common Mistakes

### Forgetting Parameters

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Error: Missing required parameter
await getUser({})

// ✅ Correct
await getUser({ urlParams: { userId: '123' } })
```

### Wrong Parameter Name

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Error: Property 'id' does not exist
await getUser({ urlParams: { id: '123' } })

// ✅ Correct
await getUser({ urlParams: { userId: '123' } })
```

## Next Steps

- [Query Parameters](/docs/builder/builder/guides/query-parameters) - Learn about query string parameters
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint declaration basics
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
