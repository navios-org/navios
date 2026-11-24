# Request & Response Schemas

Schemas are the foundation of type safety in Builder. You define the shape of your request and response data with schemas, and Builder automatically validates and types everything.

This guide uses [Zod](https://zod.dev). Every schema slot also accepts a schema from any other library that implements [Standard Schema](https://standardschema.dev) — see [Other Schema Libraries](#other-schema-libraries).

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

// Attach it to the statuses that return it
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: errorResponseSchema,
    422: errorResponseSchema,
  },
})
```

A response with one of those statuses fails the call with an `EndpointError` whose `body` is typed from the schema. See [Error Handling](/docs/builder/builder/guides/error-handling#typed-error-bodies-with-errorschema).

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

Or extract them from an endpoint:

```typescript
import type { EndpointErrorType, EndpointParams, EndpointResult } from '@navios/builder'

type GetUserArgs = EndpointParams<typeof getUser> // call arguments
type GetUserData = EndpointResult<typeof getUser> // resolved data
type GetUserError = EndpointErrorType<typeof getUser> // typed EndpointError
```

## Other Schema Libraries

Every schema slot of an endpoint — `requestSchema`, `querySchema`, `urlParamsSchema`, `responseSchema`, `errorSchema` and `responses` — accepts any [Standard Schema](https://standardschema.dev) v1 implementation: Zod, Valibot, ArkType and others. Builder exports the interface as `Schema`:

```typescript
interface Schema<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}
```

What holds for every library:

- **Types are inferred the same way.** Call arguments use the schema's input type, results and error bodies its output type.
- **The validated value is what is used.** The request is built from the schema's output, and the call resolves to the output of the response schema.
- **Asynchronous validation is supported.** `validate` may return a promise; the endpoint awaits it.
- **Libraries can be mixed.** Each slot is validated on its own, so one endpoint can take its `requestSchema` from one library and its `errorSchema` entries from another.
- **Failures look the same.** A rejected value fails the call with an `EndpointError` of kind `request-validation` or `response-validation`, and `error.issues` holds the schema's issues as `{ message, path? }` objects.

For example, with [Valibot](https://valibot.dev) and [ArkType](https://arktype.io), and all three libraries on one endpoint:

```typescript
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod/v4'

// Valibot
const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: v.object({ name: v.pipe(v.string(), v.minLength(2)) }),
  responseSchema: v.object({ id: v.string(), name: v.string() }),
  errorSchema: { 409: v.object({ reason: v.string() }) },
})

// ArkType
const listUsers = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: type({ 'page?': 'number >= 1' }),
  responseSchema: type({ id: 'string', name: 'string' }).array(),
})

// One library per slot
const renameUser = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  urlParamsSchema: z.object({ userId: z.coerce.number().int() }),
  requestSchema: v.object({ name: v.string() }),
  responseSchema: type({ id: 'string', name: 'string' }),
})
```

A library's schema objects are passed as they are. The interface is small enough to write by hand, which shows everything Builder relies on:

```typescript
import type { Schema } from '@navios/builder'

const slugSchema: Schema<{ slug: string }> = {
  '~standard': {
    version: 1,
    vendor: 'my-app',
    validate: (value) => {
      const slug = (value as { slug?: unknown } | null)?.slug
      return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)
        ? { value: { slug } }
        : { issues: [{ message: 'Expected a lower-case slug', path: ['slug'] }] }
    },
  },
}

const renameProject = API.declareEndpoint({
  method: 'PUT',
  url: '/projects/$projectId/slug',
  requestSchema: slugSchema, // hand-written Standard Schema
  responseSchema: z.object({ id: z.string(), slug: z.string() }), // Zod
})

// data is typed { slug: string }
await renameProject({ urlParams: { projectId: '1' }, data: { slug: 'my-project' } })

const result = await renameProject.safe({
  urlParams: { projectId: '1' },
  data: { slug: 'Not A Slug' },
})

if (!result.ok && result.error.kind === 'request-validation') {
  result.error.issues // [{ message: 'Expected a lower-case slug', path: ['slug'] }]
}
```

The static types come from the schema's `Input` and `Output` type parameters (the optional `types` property exists only to carry them), so give a hand-written schema an explicit `Schema<Input, Output>` type.

To extract the types of any schema, use the vendor-neutral helpers:

```typescript
import type { InferSchemaInput, InferSchemaOutput } from '@navios/builder'

type SlugInput = InferSchemaInput<typeof slugSchema> // { slug: string }
type SlugOutput = InferSchemaOutput<typeof slugSchema> // { slug: string }
```

### What Depends on Zod

`zod` is an optional peer dependency: the builder, including the socket and EventSource builders, never imports it. Three things still behave differently for Zod schemas:

- **The declaration-time `urlParamsSchema` check.** Comparing the schema's keys with the URL's `$param` names needs the keys, which Zod objects expose as `.shape`. A schema without `.shape` skips the check and is validated on each call only.
- **`error.cause` for validation failures.** For a Zod schema it is the original `ZodError`; for other libraries it is `undefined`. `error.issues` is filled in both cases.
- **Server-side packages.** `@navios/core` controllers and OpenAPI generation read Zod schemas directly. An endpoint that is shared with the server must use Zod in every slot; the `ZodBaseEndpointOptions` and `ZodEndpointOptions` types exported by `@navios/core` describe such an endpoint.

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

