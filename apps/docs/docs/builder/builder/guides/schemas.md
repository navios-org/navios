---
sidebar_position: 4
---

# Request & Response Schemas

Schemas are the foundation of type safety in Builder. Using Zod schemas, you define the shape of your request and response data, and Builder automatically validates and types everything.

## Why Schemas?

Schemas provide:
- **Type Safety**: TypeScript knows the exact shape of your data
- **Runtime Validation**: Invalid data is caught before it causes bugs
- **Documentation**: Schemas serve as living documentation
- **Refactoring Safety**: Changes to schemas are caught at compile time

## Basic Schema Definition

Start with simple object schemas:

```typescript
import { z } from 'zod'

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

## Schema Reuse

Reuse schemas across multiple endpoints:

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

// Use full schema for GET
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Omit fields for POST (no id or createdAt)
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})

// Make fields optional for PATCH
const updateUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: userSchema.partial().omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})
```

## Common Zod Patterns

### Primitives

```typescript
const schema = z.object({
  // Strings
  name: z.string(),
  email: z.string().email(),
  url: z.string().url(),
  uuid: z.string().uuid(),
  
  // Numbers
  age: z.number(),
  price: z.number().positive(),
  quantity: z.number().int().min(0),
  
  // Booleans
  active: z.boolean(),
  
  // Dates
  createdAt: z.string().datetime(),
  updatedAt: z.date(),
})
```

### Optional Fields

```typescript
const schema = z.object({
  name: z.string(),
  email: z.string().email().optional(), // Optional
  age: z.number().optional(),
})
```

### Default Values

```typescript
const schema = z.object({
  name: z.string(),
  status: z.enum(['active', 'inactive']).default('active'),
  count: z.number().default(0),
})
```

### Arrays

```typescript
const schema = z.object({
  tags: z.array(z.string()),
  users: z.array(userSchema),
  ids: z.array(z.string().uuid()),
})
```

### Nested Objects

```typescript
const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
})

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: addressSchema, // Nested object
})
```

### Unions

```typescript
const statusSchema = z.union([
  z.object({ type: z.literal('success'), data: userSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
```

### Discriminated Unions

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
```

See [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) for more details.

## Schema Transformations

### Extend

Add fields to an existing schema:

```typescript
const baseUserSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const userWithEmailSchema = baseUserSchema.extend({
  email: z.string().email(),
})
```

### Pick

Select specific fields:

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
})

const publicUserSchema = userSchema.pick({ id: true, name: true, email: true })
// { id: string; name: string; email: string }
```

### Omit

Remove specific fields:

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
})

const createUserSchema = userSchema.omit({ id: true, password: true })
// { name: string; email: string }
```

### Partial

Make all fields optional:

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const updateUserSchema = userSchema.partial()
// { id?: string; name?: string; email?: string }
```

### Required

Make all fields required:

```typescript
const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
})

const requiredUserSchema = userSchema.required()
// { id: string; name: string }
```

## Advanced Validation

### Custom Validation

```typescript
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
```

### Refinement

```typescript
const userSchema = z.object({
  email: z.string().email(),
  confirmEmail: z.string().email(),
}).refine((data) => data.email === data.confirmEmail, {
  message: "Emails don't match",
  path: ['confirmEmail'],
})
```

### Transform

```typescript
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().transform((str) => new Date(str)),
})
```

## Common Patterns

### CRUD Schemas

```typescript
// Base schema
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

// Create - omit generated fields
const createUserSchema = userSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

// Update - make fields optional, omit generated fields
const updateUserSchema = userSchema
  .partial()
  .omit({ id: true, createdAt: true, updatedAt: true })

// Response - use full schema
const userResponseSchema = userSchema
```

### Pagination Schemas

```typescript
const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
})

const paginatedUsersSchema = paginationSchema.extend({
  users: z.array(userSchema),
})
```

### Error Schemas

```typescript
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
})

const errorResponseSchema = z.object({
  error: errorSchema,
})
```

## Organizing Schemas

### Single File

```typescript
// schemas/user.ts
import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const createUserSchema = userSchema.omit({ id: true })
export const updateUserSchema = userSchema.partial().omit({ id: true })
```

### Multiple Files

```typescript
// schemas/index.ts
export * from './user'
export * from './post'
export * from './comment'

// schemas/user.ts
export const userSchema = z.object({ ... })

// schemas/post.ts
export const postSchema = z.object({ ... })
```

## Type Extraction

Extract TypeScript types from schemas:

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// Extract input type (what you pass in)
type UserInput = z.input<typeof userSchema>

// Extract output type (what you get after validation)
type User = z.output<typeof userSchema>

// Use in functions
function processUser(user: User) {
  // user is fully typed
}
```

## Best Practices

### Keep Schemas DRY

```typescript
// ✅ Good - reuse base schema
const baseUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const createUserSchema = baseUserSchema.omit({ id: true })
const updateUserSchema = baseUserSchema.partial().omit({ id: true })

// ❌ Bad - duplicate schemas
const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})
const updateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
})
```

### Use Descriptive Names

```typescript
// ✅ Good
const createUserRequestSchema = z.object({ ... })
const userResponseSchema = z.object({ ... })

// ❌ Bad
const schema1 = z.object({ ... })
const schema2 = z.object({ ... })
```

### Validate Early

```typescript
// ✅ Good - strict validation
const emailSchema = z.string().email()

// ❌ Bad - loose validation
const emailSchema = z.string()
```

### Document Complex Schemas

```typescript
/**
 * User schema for API responses
 * 
 * @property id - Unique user identifier (UUID)
 * @property name - User's full name
 * @property email - User's email address (validated)
 * @property createdAt - ISO 8601 datetime string
 */
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})
```

## Next Steps

- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle validation errors
- [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) - Handle multiple response types
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Use schemas in endpoints

