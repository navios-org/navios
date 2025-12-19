---
sidebar_position: 1
---

# Commands

Commands are the core building blocks of Navios Commander. This guide covers everything you need to know about creating and structuring commands.

## What is a Command?

A command is a class that handles a specific CLI operation. Commands are decorated with `@Command` and must implement the `CommandHandler` interface.

## Basic Command

The simplest command has a path and an `execute` method:

```typescript
import { Command, CommandHandler } from '@navios/commander'

@Command({ path: 'greet' })
export class GreetCommand implements CommandHandler {
  async execute() {
    console.log('Hello, World!')
  }
}
```

## Command with Options

Commands can accept options that are validated with Zod schemas:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { z } from 'zod'

const greetOptionsSchema = z.object({
  name: z.string(),
  greeting: z.string().optional().default('Hello'),
})

type GreetOptions = z.infer<typeof greetOptionsSchema>

@Command({
  path: 'greet',
  optionsSchema: greetOptionsSchema,
})
export class GreetCommand implements CommandHandler<GreetOptions> {
  async execute(options: GreetOptions) {
    console.log(`${options.greeting}, ${options.name}!`)
  }
}
```

## Command Paths

Command paths identify commands and can include namespaces:

### Simple Paths

```typescript
@Command({ path: 'greet' })
@Command({ path: 'version' })
@Command({ path: 'help' })
```

### Namespaced Paths

Use colons to create namespaces:

```typescript
@Command({ path: 'user:create' })
@Command({ path: 'user:delete' })
@Command({ path: 'user:list' })
@Command({ path: 'db:migrate' })
@Command({ path: 'db:seed' })
```

### Nested Namespaces

You can create deeper hierarchies:

```typescript
@Command({ path: 'admin:user:create' })
@Command({ path: 'admin:user:delete' })
@Command({ path: 'admin:config:set' })
```

## Command Options

### Basic Options

Define options using Zod schemas:

```typescript
const optionsSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

@Command({
  path: 'create-user',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    console.log('Creating user:', options)
  }
}
```

### Optional Options

Mark options as optional:

```typescript
const optionsSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  age: z.number().optional(),
})

@Command({
  path: 'create-user',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    // email and age may be undefined
    console.log('Creating user:', options.name)
    if (options.email) {
      console.log('Email:', options.email)
    }
  }
}
```

### Default Values

Provide default values:

```typescript
const optionsSchema = z.object({
  name: z.string(),
  greeting: z.string().default('Hello'),
  verbose: z.boolean().default(false),
})

@Command({
  path: 'greet',
  optionsSchema: optionsSchema,
})
export class GreetCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    // greeting defaults to 'Hello' if not provided
    // verbose defaults to false if not provided
    console.log(`${options.greeting}, ${options.name}!`)
    if (options.verbose) {
      console.log('Verbose mode enabled')
    }
  }
}
```

### Complex Options

Use Zod's advanced features for complex validation:

```typescript
const optionsSchema = z.object({
  // String with constraints
  name: z.string().min(3).max(50),
  
  // Number with range
  age: z.number().int().min(18).max(120),
  
  // Enum
  role: z.enum(['admin', 'user', 'guest']),
  
  // Array
  tags: z.array(z.string()).optional(),
  
  // Nested object
  address: z.object({
    street: z.string(),
    city: z.string(),
    zip: z.string().regex(/^\d{5}$/),
  }).optional(),
  
  // Union types
  status: z.union([z.literal('active'), z.literal('inactive')]),
  
  // Custom validation
  email: z.string().email().refine(
    (email) => email.endsWith('@example.com'),
    { message: 'Email must be from example.com' }
  ),
})

@Command({
  path: 'create-user',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    // All options are validated and typed
    console.log('Creating user:', options)
  }
}
```

## Command Execution

### Synchronous Execution

Commands can execute synchronously:

```typescript
@Command({ path: 'version' })
export class VersionCommand implements CommandHandler {
  execute() {
    console.log('1.0.0')
  }
}
```

### Asynchronous Execution

Commands can execute asynchronously:

```typescript
@Command({ path: 'fetch-data' })
export class FetchDataCommand implements CommandHandler {
  async execute() {
    const data = await fetch('https://api.example.com/data')
    const json = await data.json()
    console.log(json)
  }
}
```

## Command with Dependencies

Commands can inject services using dependency injection:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'

@Injectable()
class UserService {
  async createUser(data: { name: string; email: string }) {
    // Create user logic
    return { id: '123', ...data }
  }
}

const optionsSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

@Command({
  path: 'user:create',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  private userService = inject(UserService)

  async execute(options) {
    const user = await this.userService.createUser(options)
    console.log('User created:', user)
  }
}
```

Learn more about [dependency injection in commands](/docs/commander/guides/dependency-injection).

## Command Error Handling

### Throwing Errors

Commands can throw errors that will be caught by the application:

```typescript
@Command({ path: 'delete-user' })
export class DeleteUserCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    
    if (!user) {
      throw new Error(`User ${options.userId} not found`)
    }
    
    await this.userService.deleteUser(options.userId)
    console.log('User deleted')
  }
}
```

### Error Messages

Provide helpful error messages:

```typescript
@Command({ path: 'process-file' })
export class ProcessFileCommand implements CommandHandler {
  async execute(options: { file: string }) {
    try {
      const content = await fs.readFile(options.file, 'utf-8')
      // Process file
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${options.file}`)
      }
      throw new Error(`Failed to process file: ${error.message}`)
    }
  }
}
```

## Command Output

### Console Output

Commands can output to console:

```typescript
@Command({ path: 'list-users' })
export class ListUsersCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute() {
    const users = await this.userService.getAllUsers()
    
    console.log('Users:')
    users.forEach((user) => {
      console.log(`  - ${user.name} (${user.email})`)
    })
  }
}
```

### Structured Output

For structured output, consider using JSON:

```typescript
@Command({ path: 'list-users' })
export class ListUsersCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options: { json?: boolean }) {
    const users = await this.userService.getAllUsers()
    
    if (options.json) {
      console.log(JSON.stringify(users, null, 2))
    } else {
      // Human-readable format
      users.forEach((user) => {
        console.log(`${user.name} - ${user.email}`)
      })
    }
  }
}
```

## Command Best Practices

### 1. Use Descriptive Paths

```typescript
// ✅ Good: Clear and descriptive
@Command({ path: 'user:create' })
@Command({ path: 'database:migrate' })

// ❌ Avoid: Vague or unclear
@Command({ path: 'create' })
@Command({ path: 'migrate' })
```

### 2. Validate All Options

Always provide schemas for command options:

```typescript
// ✅ Good: Validated options
@Command({
  path: 'create-user',
  optionsSchema: z.object({
    name: z.string().min(1),
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

### 3. Use Namespaces

Group related commands with namespaces:

```typescript
// ✅ Good: Organized with namespaces
@Command({ path: 'user:create' })
@Command({ path: 'user:delete' })
@Command({ path: 'user:list' })

// ❌ Avoid: Flat structure
@Command({ path: 'create-user' })
@Command({ path: 'delete-user' })
@Command({ path: 'list-users' })
```

### 4. Keep Commands Focused

Each command should do one thing well:

```typescript
// ✅ Good: Focused command
@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: { name: string; email: string }) {
    // Only creates users
  }
}

// ❌ Avoid: Doing too much
@Command({ path: 'user:manage' })
export class ManageUserCommand implements CommandHandler {
  async execute(options: { action: string; ... }) {
    // Creates, updates, deletes - too many responsibilities
  }
}
```

### 5. Handle Errors Gracefully

Provide meaningful error messages:

```typescript
// ✅ Good: Helpful error messages
@Command({ path: 'delete-user' })
export class DeleteUserCommand implements CommandHandler {
  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    if (!user) {
      throw new Error(`User ${options.userId} not found`)
    }
    await this.userService.deleteUser(options.userId)
  }
}
```

## Next Steps

- Learn about [modules](/docs/commander/guides/modules) to organize commands
- Explore [dependency injection](/docs/commander/guides/dependency-injection) in commands
- Understand [validation](/docs/commander/guides/validation) with Zod schemas
- Check out [execution context](/docs/commander/guides/execution-context) for command metadata

