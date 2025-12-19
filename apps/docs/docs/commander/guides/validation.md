---
sidebar_position: 5
---

# Validation

Navios Commander uses Zod schemas to validate command options. This ensures type safety and provides helpful error messages when options are invalid.

## Basic Validation

Define a Zod schema and pass it to the `@Command` decorator:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { z } from 'zod'

const optionsSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(18),
})

@Command({
  path: 'create-user',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    // options are validated and typed
    console.log('Creating user:', options)
  }
}
```

## String Validation

### Basic String

```typescript
const schema = z.object({
  name: z.string(),
})
```

### String with Constraints

```typescript
const schema = z.object({
  name: z.string().min(3).max(50),
  username: z.string().regex(/^[a-z0-9_]+$/),
  email: z.string().email(),
  url: z.string().url(),
  uuid: z.string().uuid(),
})
```

### String with Custom Validation

```typescript
const schema = z.object({
  password: z.string().min(8).refine(
    (password) => /[A-Z]/.test(password),
    { message: 'Password must contain at least one uppercase letter' }
  ),
})
```

## Number Validation

### Basic Number

```typescript
const schema = z.object({
  age: z.number(),
  price: z.number(),
})
```

### Number with Constraints

```typescript
const schema = z.object({
  age: z.number().int().min(18).max(120),
  price: z.number().positive(),
  discount: z.number().min(0).max(100),
})
```

### Number with Precision

```typescript
const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
```

## Boolean Validation

```typescript
const schema = z.object({
  verbose: z.boolean(),
  force: z.boolean().default(false),
  dryRun: z.boolean().optional(),
})
```

## Array Validation

### Basic Array

```typescript
const schema = z.object({
  tags: z.array(z.string()),
  ids: z.array(z.number()),
})
```

### Array with Constraints

```typescript
const schema = z.object({
  tags: z.array(z.string()).min(1).max(10),
  items: z.array(z.string()).nonempty(),
})
```

### Array of Objects

```typescript
const schema = z.object({
  users: z.array(
    z.object({
      name: z.string(),
      email: z.string().email(),
    })
  ),
})
```

## Object Validation

### Nested Objects

```typescript
const schema = z.object({
  user: z.object({
    name: z.string(),
    email: z.string().email(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string(),
    }).optional(),
  }),
})
```

### Optional Objects

```typescript
const schema = z.object({
  config: z.object({
    apiUrl: z.string().url(),
    timeout: z.number(),
  }).optional(),
})
```

## Optional and Default Values

### Optional Fields

```typescript
const schema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  age: z.number().optional(),
})
```

### Default Values

```typescript
const schema = z.object({
  name: z.string(),
  verbose: z.boolean().default(false),
  timeout: z.number().default(5000),
  greeting: z.string().default('Hello'),
})
```

### Optional with Default

```typescript
const schema = z.object({
  name: z.string(),
  email: z.string().email().optional().default('user@example.com'),
})
```

## Union Types

### String Union

```typescript
const schema = z.object({
  role: z.enum(['admin', 'user', 'guest']),
  status: z.union([z.literal('active'), z.literal('inactive')]),
})
```

### Type Union

```typescript
const schema = z.object({
  value: z.union([z.string(), z.number()]),
})
```

## Enum Validation

```typescript
const schema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
})
```

## Date Validation

```typescript
const schema = z.object({
  startDate: z.string().datetime(),
  endDate: z.coerce.date(),
})
```

## Custom Validation

### refine()

Add custom validation logic:

```typescript
const schema = z.object({
  password: z.string().min(8).refine(
    (password) => {
      return /[A-Z]/.test(password) && 
             /[a-z]/.test(password) && 
             /[0-9]/.test(password)
    },
    { message: 'Password must contain uppercase, lowercase, and number' }
  ),
})
```

### superRefine()

For complex validation:

```typescript
const schema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).superRefine((data, ctx) => {
  if (new Date(data.endDate) < new Date(data.startDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be after start date',
    })
  }
})
```

## Transform and Preprocess

### Transform

Transform values during validation:

```typescript
const schema = z.object({
  port: z.string().transform((val) => parseInt(val, 10)),
  tags: z.string().transform((val) => val.split(',')),
})
```

### Preprocess

Preprocess values before validation:

```typescript
const schema = z.object({
  count: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number()
  ),
})
```

## Error Messages

Zod provides helpful error messages automatically:

```typescript
const schema = z.object({
  email: z.string().email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18 years old'),
})
```

### Custom Error Messages

```typescript
const schema = z.object({
  email: z.string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  }).email('Invalid email format'),
})
```

## Complex Examples

### User Creation

```typescript
const createUserSchema = z.object({
  name: z.string().min(3).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  role: z.enum(['admin', 'user', 'guest']).default('user'),
  tags: z.array(z.string()).optional(),
  metadata: z.object({
    department: z.string().optional(),
    location: z.string().optional(),
  }).optional(),
})

@Command({
  path: 'user:create',
  optionsSchema: createUserSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof createUserSchema>
> {
  async execute(options) {
    // All options are validated
    console.log('Creating user:', options)
  }
}
```

### Database Migration

```typescript
const migrateSchema = z.object({
  version: z.string().regex(/^\d+$/),
  direction: z.enum(['up', 'down']),
  force: z.boolean().default(false),
  dryRun: z.boolean().default(false),
})

@Command({
  path: 'db:migrate',
  optionsSchema: migrateSchema,
})
export class MigrateCommand implements CommandHandler<
  z.infer<typeof migrateSchema>
> {
  async execute(options) {
    // Migration logic
  }
}
```

### File Processing

```typescript
const processFileSchema = z.object({
  file: z.string().min(1),
  output: z.string().optional(),
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  options: z.object({
    delimiter: z.string().default(','),
    encoding: z.string().default('utf-8'),
  }).optional(),
})

@Command({
  path: 'process:file',
  optionsSchema: processFileSchema,
})
export class ProcessFileCommand implements CommandHandler<
  z.infer<typeof processFileSchema>
> {
  async execute(options) {
    // File processing logic
  }
}
```

## Validation Errors

When validation fails, Zod throws a `ZodError` with detailed information:

```typescript
@Command({ path: 'create-user' })
export class CreateUserCommand implements CommandHandler {
  async execute(options) {
    // If options don't match schema, ZodError is thrown
    // The error includes:
    // - Field that failed
    // - Expected type
    // - Received value
    // - Error message
  }
}
```

The application automatically handles validation errors and displays helpful messages:

```bash
$ node cli.js create-user --name "John" --email "invalid"
Error: Invalid email format
```

## Best Practices

### 1. Always Define Schemas

```typescript
// ✅ Good: Schema defined
@Command({
  path: 'create-user',
  optionsSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
})

// ❌ Avoid: No validation
@Command({ path: 'create-user' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: any) {
    // No type safety or validation
  }
}
```

### 2. Use Descriptive Error Messages

```typescript
// ✅ Good: Clear error messages
const schema = z.object({
  age: z.number().min(18, 'Must be at least 18 years old'),
  email: z.string().email('Invalid email address'),
})
```

### 3. Provide Defaults for Optional Fields

```typescript
// ✅ Good: Default values
const schema = z.object({
  verbose: z.boolean().default(false),
  timeout: z.number().default(5000),
})
```

### 4. Use Enums for Limited Choices

```typescript
// ✅ Good: Enum for limited choices
const schema = z.object({
  environment: z.enum(['dev', 'staging', 'prod']),
})

// ❌ Avoid: String with manual validation
const schema = z.object({
  environment: z.string(), // No validation
})
```

## Next Steps

- Learn about [commands](/docs/commander/guides/commands) in detail
- Explore [dependency injection](/docs/commander/guides/dependency-injection) in commands
- Check out [Zod documentation](https://zod.dev) for more validation options

