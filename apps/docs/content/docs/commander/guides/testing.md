---
sidebar_position: 6
---

# Testing

Testing CLI commands is essential for ensuring your commands work correctly. Navios Commander provides programmatic command execution, making it easy to test commands in isolation.

## Basic Testing

Use `executeCommand()` to test commands programmatically:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'

describe('GreetCommand', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should greet with default greeting', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('greet', { name: 'World' })
    
    expect(consoleSpy).toHaveBeenCalledWith('Hello, World!')
    consoleSpy.mockRestore()
  })

  it('should greet with custom greeting', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('greet', { name: 'World', greeting: 'Hi' })
    
    expect(consoleSpy).toHaveBeenCalledWith('Hi, World!')
    consoleSpy.mockRestore()
  })
})
```

## Testing with Mocked Services

Mock services to test commands in isolation:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'
import { UserService } from './user.service'

describe('ShowUserCommand', () => {
  let app: CommanderApplication
  let mockUserService: jest.Mocked<UserService>

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()

    // Get the container and replace service
    const container = app.getContainer()
    mockUserService = {
      getUser: jest.fn().mockResolvedValue({
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
      }),
    } as any

    // Replace service in container
    // Note: This requires access to container internals
    // In practice, you might use dependency injection tokens
  })

  afterAll(async () => {
    await app.close()
  })

  it('should show user information', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('user:show', { userId: '123' })
    
    expect(mockUserService.getUser).toHaveBeenCalledWith('123')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('John Doe')
    )
    consoleSpy.mockRestore()
  })
})
```

## Testing Validation

Test that commands validate options correctly:

```typescript
describe('CreateUserCommand', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should reject invalid email', async () => {
    await expect(
      app.executeCommand('user:create', {
        name: 'John',
        email: 'invalid-email',
      })
    ).rejects.toThrow()
  })

  it('should reject missing required fields', async () => {
    await expect(
      app.executeCommand('user:create', {
        name: 'John',
        // email is missing
      })
    ).rejects.toThrow()
  })

  it('should accept valid options', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('user:create', {
      name: 'John Doe',
      email: 'john@example.com',
    })
    
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

## Testing Error Handling

Test that commands handle errors correctly:

```typescript
describe('DeleteUserCommand', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should throw error when user not found', async () => {
    await expect(
      app.executeCommand('user:delete', { userId: 'nonexistent' })
    ).rejects.toThrow('User not found')
  })

  it('should delete user successfully', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('user:delete', { userId: '123' })
    
    expect(consoleSpy).toHaveBeenCalledWith('User deleted')
    consoleSpy.mockRestore()
  })
})
```

## Testing with Test Containers

Create test-specific modules for isolated testing:

```typescript
import { CliModule } from '@navios/commander'
import { TestUserService } from './test-user.service'
import { ShowUserCommand } from './show-user.command'

@CliModule({
  commands: [ShowUserCommand],
})
export class TestModule {}

describe('ShowUserCommand', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(TestModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should show user', async () => {
    // Test with test module
    await app.executeCommand('user:show', { userId: '123' })
  })
})
```

## Testing Command Output

Test command output and side effects:

```typescript
describe('ListUsersCommand', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should list users in JSON format', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('user:list', { json: true })
    
    const output = consoleSpy.mock.calls[0][0]
    const users = JSON.parse(output)
    
    expect(Array.isArray(users)).toBe(true)
    expect(users.length).toBeGreaterThan(0)
    consoleSpy.mockRestore()
  })

  it('should list users in human-readable format', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('user:list', { json: false })
    
    const output = consoleSpy.mock.calls[0][0]
    expect(output).toContain('Users:')
    consoleSpy.mockRestore()
  })
})
```

## Integration Testing

Test commands with real services:

```typescript
describe('UserCommands Integration', () => {
  let app: CommanderApplication
  let testDb: TestDatabase

  beforeAll(async () => {
    testDb = await setupTestDatabase()
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await testDb.cleanup()
    await app.close()
  })

  it('should create and show user', async () => {
    // Create user
    await app.executeCommand('user:create', {
      name: 'Test User',
      email: 'test@example.com',
    })

    // Show user
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    await app.executeCommand('user:show', { userId: 'test-id' })
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test User')
    )
    consoleSpy.mockRestore()
  })
})
```

## Testing Execution Context

Test commands that use execution context:

```typescript
describe('CommandLogger', () => {
  let app: CommanderApplication

  beforeAll(async () => {
    app = await CommanderFactory.create(AppModule)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should log command execution', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    
    await app.executeCommand('process', { file: 'test.txt' })
    
    // Check that execution context was used
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Command: process')
    )
    consoleSpy.mockRestore()
  })
})
```

## Testing Module Loading

Test that modules load correctly:

```typescript
describe('Module Loading', () => {
  it('should load all commands from module', async () => {
    const app = await CommanderFactory.create(AppModule)
    await app.init()

    const commands = app.getAllCommands()
    
    expect(commands).toHaveLength(3)
    expect(commands.map(c => c.path)).toContain('user:create')
    expect(commands.map(c => c.path)).toContain('user:delete')
    expect(commands.map(c => c.path)).toContain('user:list')

    await app.close()
  })

  it('should load commands from imported modules', async () => {
    const app = await CommanderFactory.create(AppModule)
    await app.init()

    const commands = app.getAllCommands()
    
    // Commands from imported modules should be available
    expect(commands.map(c => c.path)).toContain('db:migrate')
    expect(commands.map(c => c.path)).toContain('db:seed')

    await app.close()
  })
})
```

## Best Practices

### 1. Isolate Tests

Each test should be independent:

```typescript
// ✅ Good: Isolated test
it('should create user', async () => {
  await app.executeCommand('user:create', { name: 'John', email: 'john@example.com' })
  // Test assertions
})

// ❌ Avoid: Tests that depend on each other
it('should create user', async () => {
  await app.executeCommand('user:create', { name: 'John', email: 'john@example.com' })
})

it('should show user', async () => {
  // Depends on previous test
  await app.executeCommand('user:show', { userId: '123' })
})
```

### 2. Mock External Dependencies

Mock services that interact with external systems:

```typescript
// ✅ Good: Mocked external service
const mockEmailService = {
  send: jest.fn().mockResolvedValue(true),
}

// ❌ Avoid: Real external service calls
// This would send actual emails during tests
```

### 3. Test Error Cases

Test both success and error scenarios:

```typescript
// ✅ Good: Test both cases
it('should handle valid input', async () => {
  // Success case
})

it('should reject invalid input', async () => {
  // Error case
})
```

### 4. Clean Up Resources

Always clean up resources after tests:

```typescript
// ✅ Good: Clean up
afterAll(async () => {
  await app.close()
  await testDb.cleanup()
})
```

## Next Steps

- Learn about [commands](/docs/commander/guides/commands) in detail
- Explore [programmatic execution](/docs/commander/api-reference#commanderapplication) for testing
- Check out [best practices](/docs/commander/best-practices) for command design

