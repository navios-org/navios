---
sidebar_position: 3
---

# Query Parameters

Query parameters allow you to add optional or required query string parameters to your endpoints. Builder uses Zod schemas to validate and type query parameters, just like request and response bodies.

## Basic Usage

Add query parameters using the `querySchema` option:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Usage
const users = await getUsers({
  params: {
    page: 1,
    limit: 20,
  },
})
```

## Optional Parameters

By default, all query parameters are optional unless you mark them as required:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(), // Optional
    limit: z.number().optional(), // Optional
    search: z.string().optional(), // Optional
  }),
  responseSchema: z.array(userSchema),
})

// All of these are valid
await getUsers({}) // No params
await getUsers({ params: { page: 1 } }) // Only page
await getUsers({ params: { page: 1, limit: 20 } }) // Multiple params
```

## Required Parameters

Use `.required()` or remove `.optional()` to make parameters required:

```typescript
const searchUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users/search',
  querySchema: z.object({
    query: z.string(), // Required
    page: z.number().optional(), // Optional
    limit: z.number().optional(), // Optional
  }),
  responseSchema: z.array(userSchema),
})

// ✅ Valid
await searchUsers({ params: { query: 'john' } })

// ❌ Error: query is required
await searchUsers({ params: {} })
```

## Type Validation

Query parameters are validated against your schema:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().min(1),
    limit: z.number().min(1).max(100),
  }),
  responseSchema: z.array(userSchema),
})

// ✅ Valid
await getUsers({ params: { page: 1, limit: 20 } })

// ❌ Validation error: limit must be <= 100
await getUsers({ params: { page: 1, limit: 200 } })
```

## Common Types

### Strings

```typescript
const searchUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    search: z.string(),
    filter: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

### Numbers

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
  }),
  responseSchema: z.array(userSchema),
})
```

### Booleans

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    active: z.boolean().optional(),
    verified: z.boolean().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Usage
await getUsers({ params: { active: true } })
```

### Enums

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    sortBy: z.enum(['name', 'email', 'createdAt']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

### Arrays

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    tags: z.array(z.string()).optional(),
    ids: z.array(z.string()).optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Usage
await getUsers({ params: { tags: ['admin', 'user'] } })
```

:::tip
Array query parameters are typically sent as `?tags=admin&tags=user` or `?tags[]=admin&tags[]=user` depending on your server's parsing. Check your HTTP client's documentation for array serialization.
:::

## Default Values

Use `.default()` to provide default values:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    sortBy: z.enum(['name', 'email']).default('name'),
  }),
  responseSchema: z.array(userSchema),
})

// If params are omitted, defaults are used
await getUsers({}) // Uses page=1, limit=20, sortBy='name'
```

## Combining with URL Parameters

Query parameters work seamlessly with URL parameters:

```typescript
const getUserPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts', // URL param
  querySchema: z.object({
    page: z.number().optional(), // Query param
    limit: z.number().optional(), // Query param
  }),
  responseSchema: z.array(postSchema),
})

// Usage
const posts = await getUserPosts({
  urlParams: { userId: '123' },
  params: { page: 1, limit: 10 },
})
```

## Combining with Request Bodies

Query parameters can be used with POST/PUT/PATCH requests:

```typescript
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  querySchema: z.object({
    notify: z.boolean().optional(),
  }),
  requestSchema: z.object({
    name: z.string(),
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

## Complex Validation

You can use Zod's advanced features for complex validation:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    // Date range
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    // Number range
    minAge: z.number().int().min(0).optional(),
    maxAge: z.number().int().max(150).optional(),
    // String with constraints
    email: z.string().email().optional(),
    // Custom validation
    userId: z.string().uuid().optional(),
  }).refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate)
      }
      return true
    },
    { message: 'startDate must be before endDate' }
  ),
  responseSchema: z.array(userSchema),
})
```

## Type Inference

TypeScript automatically infers query parameter types:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Type is inferred
type QueryParams = Parameters<typeof getUsers>[0]['params']
// QueryParams = { page?: number; limit?: number } | undefined
```

## Common Patterns

### Pagination

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
})
```

### Filtering

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    status: z.enum(['active', 'inactive', 'pending']).optional(),
    role: z.enum(['admin', 'user', 'guest']).optional(),
    verified: z.boolean().optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

### Sorting

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
  responseSchema: z.array(userSchema),
})
```

### Search

```typescript
const searchUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users/search',
  querySchema: z.object({
    q: z.string().min(1), // Required search query
    limit: z.number().int().min(1).max(50).default(10),
  }),
  responseSchema: z.array(userSchema),
})
```

## Best Practices

### Use Descriptive Names

```typescript
// ✅ Good
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    pageNumber: z.number().optional(),
    itemsPerPage: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// ❌ Bad - unclear abbreviations
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    p: z.number().optional(),
    l: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

### Provide Defaults for Common Parameters

```typescript
// ✅ Good - sensible defaults
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
  }),
  responseSchema: z.array(userSchema),
})
```

### Validate Input Ranges

```typescript
// ✅ Good - prevents invalid requests
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
  }),
  responseSchema: z.array(userSchema),
})
```

## Common Mistakes

### Forgetting Optional

```typescript
// ❌ All params are required
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number(), // Required!
    limit: z.number(), // Required!
  }),
  responseSchema: z.array(userSchema),
})

// ✅ Make them optional
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

### Type Mismatches

```typescript
// ❌ Query params are strings in URLs, but we validate as numbers
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.string(), // Should be number if you want numeric validation
  }),
  responseSchema: z.array(userSchema),
})

// ✅ Use coerce or preprocess
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})
```

## Next Steps

- [URL Parameters](/docs/builder/builder/guides/url-parameters) - Learn about URL path parameters
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint declaration basics

