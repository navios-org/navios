# Service Lifecycle

Navios DI provides built-in support for service lifecycle management through the `OnServiceInit` and `OnServiceDestroy` interfaces. These hooks allow services to perform initialization and cleanup operations when they are created or destroyed.

## Overview

Service lifecycle hooks are called automatically by the DI container:

- `onServiceInit()` - Called after the service is instantiated and all dependencies are injected
- `onServiceDestroy()` - Called when the service is being destroyed (e.g., during container invalidation)

## Basic Usage

### Service with Lifecycle Hooks

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Initializing database connection...')
    this.connection = await this.connect()
    console.log('Database connected successfully')
  }

  async onServiceDestroy() {
    console.log('Closing database connection...')
    if (this.connection) {
      await this.connection.close()
      console.log('Database connection closed')
    }
  }

  private async connect() {
    // Simulate database connection
    return new Promise((resolve) => {
      setTimeout(() => resolve({ connected: true }), 100)
    })
  }

  async query(sql: string) {
    if (!this.connection) {
      throw new Error('Database not connected')
    }
    return `Query result: ${sql}`
  }
}
```

### Using the Service

```typescript
import { Container } from '@navios/di'

const container = new Container()

// Service initialization happens automatically
const dbService = await container.get(DatabaseService)
// Output: "Initializing database connection..."
// Output: "Database connected successfully"

// Use the service
const result = await dbService.query('SELECT * FROM users')
console.log(result) // "Query result: SELECT * FROM users"

// Service destruction happens when invalidated
await container.invalidate(dbService)
// Output: "Closing database connection..."
// Output: "Database connection closed"
```

## Lifecycle Hook Details

### OnServiceInit

The `onServiceInit` method is called after:

1. The service instance is created
2. All constructor dependencies are injected
3. All property dependencies (via `syncInject` or `inject`) are resolved

```typescript
import { Injectable, OnServiceInit, syncInject } from '@navios/di'

@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class DatabaseService implements OnServiceInit {
  private readonly logger = syncInject(LoggerService)
  private connection: any = null

  async onServiceInit() {
    // Logger is already available here
    this.logger.log('Starting database initialization...')

    this.connection = await this.connect()

    this.logger.log('Database initialization complete')
  }

  private async connect() {
    // Simulate connection
    return new Promise((resolve) => {
      setTimeout(() => resolve({ connected: true }), 100)
    })
  }
}
```

### OnServiceDestroy

The `onServiceDestroy` method is called when:

1. The service is explicitly invalidated via `container.invalidate()`
2. The container is being destroyed
3. The service instance is being garbage collected

```typescript
import { Injectable, OnServiceDestroy } from '@navios/di'

@Injectable()
class CacheService implements OnServiceDestroy {
  private cache = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  async onServiceDestroy() {
    console.log('Cleaning up cache service...')

    // Clear the cache
    this.cache.clear()

    // Clear any intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    console.log('Cache service cleanup complete')
  }

  set(key: string, value: any) {
    this.cache.set(key, value)
  }

  get(key: string) {
    return this.cache.get(key)
  }
}
```

## Advanced Patterns

### Service with Multiple Resources

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class ResourceManager implements OnServiceInit, OnServiceDestroy {
  private resources: Array<{ name: string; cleanup: () => Promise<void> }> = []

  async onServiceInit() {
    console.log('Initializing resources...')

    // Initialize multiple resources
    await this.initializeDatabase()
    await this.initializeCache()
    await this.initializeFileSystem()

    console.log('All resources initialized')
  }

  async onServiceDestroy() {
    console.log('Cleaning up resources...')

    // Clean up in reverse order
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i]
      try {
        console.log(`Cleaning up ${resource.name}...`)
        await resource.cleanup()
        console.log(`${resource.name} cleaned up successfully`)
      } catch (error) {
        console.error(`Error cleaning up ${resource.name}:`, error)
      }
    }

    this.resources = []
    console.log('All resources cleaned up')
  }

  private async initializeDatabase() {
    const connection = { connected: true }
    this.resources.push({
      name: 'Database',
      cleanup: async () => {
        connection.connected = false
        console.log('Database connection closed')
      },
    })
  }

  private async initializeCache() {
    const cache = new Map()
    this.resources.push({
      name: 'Cache',
      cleanup: async () => {
        cache.clear()
        console.log('Cache cleared')
      },
    })
  }

  private async initializeFileSystem() {
    const files = ['temp1.txt', 'temp2.txt']
    this.resources.push({
      name: 'FileSystem',
      cleanup: async () => {
        // Simulate file cleanup
        console.log(`Cleaned up files: ${files.join(', ')}`)
      },
    })
  }
}
```

### Service with Conditional Initialization

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class ConditionalService implements OnServiceInit, OnServiceDestroy {
  private initialized = false
  private resources: any[] = []

  async onServiceInit() {
    console.log('Checking initialization conditions...')

    // Check if we should initialize
    if (await this.shouldInitialize()) {
      await this.performInitialization()
      this.initialized = true
      console.log('Service initialized successfully')
    } else {
      console.log('Skipping initialization due to conditions')
    }
  }

  async onServiceDestroy() {
    if (this.initialized) {
      console.log('Cleaning up initialized service...')
      await this.performCleanup()
      this.initialized = false
      console.log('Service cleanup complete')
    } else {
      console.log('No cleanup needed - service was not initialized')
    }
  }

  private async shouldInitialize(): Promise<boolean> {
    // Check environment variables, configuration, etc.
    return process.env.NODE_ENV !== 'test'
  }

  private async performInitialization() {
    // Initialize resources
    this.resources.push(await this.createResource('Resource1'))
    this.resources.push(await this.createResource('Resource2'))
  }

  private async performCleanup() {
    // Clean up resources
    for (const resource of this.resources) {
      await resource.cleanup()
    }
    this.resources = []
  }

  private async createResource(name: string) {
    return {
      name,
      cleanup: async () => console.log(`Cleaned up ${name}`),
    }
  }
}
```

### Service with Error Handling

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class RobustService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null
  private retryCount = 0
  private maxRetries = 3

  async onServiceInit() {
    console.log('Initializing robust service...')

    try {
      await this.initializeWithRetry()
      console.log('Service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize service:', error)
      // Don't throw - let the service be created but mark it as failed
      this.connection = null
    }
  }

  async onServiceDestroy() {
    console.log('Cleaning up robust service...')

    try {
      if (this.connection) {
        await this.connection.close()
        console.log('Connection closed successfully')
      }
    } catch (error) {
      console.error('Error during cleanup:', error)
      // Don't throw - cleanup should be best effort
    }
  }

  private async initializeWithRetry(): Promise<void> {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        this.connection = await this.connect()
        this.retryCount = i
        return
      } catch (error) {
        console.log(`Initialization attempt ${i + 1} failed:`, error.message)
        if (i === this.maxRetries - 1) {
          throw error
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }

  private async connect() {
    // Simulate connection that might fail
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.3) {
          // 70% success rate
          resolve({ connected: true })
        } else {
          reject(new Error('Connection failed'))
        }
      }, 100)
    })
  }

  async performOperation() {
    if (!this.connection) {
      throw new Error('Service not properly initialized')
    }
    return 'Operation completed'
  }
}
```

## Lifecycle with Dependencies

### Service Depending on Other Services with Lifecycle

```typescript
import {
  Injectable,
  OnServiceDestroy,
  OnServiceInit,
  syncInject,
} from '@navios/di'

@Injectable()
class LoggerService implements OnServiceInit, OnServiceDestroy {
  private logFile: any = null

  async onServiceInit() {
    console.log('Initializing logger...')
    this.logFile = { name: 'app.log', open: true }
    console.log('Logger initialized')
  }

  async onServiceDestroy() {
    console.log('Closing logger...')
    if (this.logFile) {
      this.logFile.open = false
      console.log('Logger closed')
    }
  }

  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private readonly logger = syncInject(LoggerService)
  private connection: any = null

  async onServiceInit() {
    // Logger is already initialized at this point
    this.logger.log('Initializing database...')

    this.connection = await this.connect()

    this.logger.log('Database initialized')
  }

  async onServiceDestroy() {
    this.logger.log('Closing database...')

    if (this.connection) {
      await this.connection.close()
      this.logger.log('Database closed')
    }
  }

  private async connect() {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ connected: true }), 100)
    })
  }
}
```

## Best Practices

### 1. Always Check Resource State

```typescript
// ✅ Good: Check if resource exists before cleanup
async onServiceDestroy() {
  if (this.connection) {
    await this.connection.close()
    this.connection = null
  }
}

// ❌ Avoid: Assuming resource exists
async onServiceDestroy() {
  await this.connection.close() // Might throw if connection is null
}
```

### 2. Handle Errors Gracefully

```typescript
// ✅ Good: Handle errors without throwing
async onServiceDestroy() {
  try {
    if (this.connection) {
      await this.connection.close()
    }
  } catch (error) {
    console.error('Error during cleanup:', error)
    // Don't throw - cleanup should be best effort
  }
}
```

### 3. Use Async/Await Consistently

```typescript
// ✅ Good: Use async/await for consistency
async onServiceInit() {
  this.connection = await this.connect()
  this.cache = await this.initializeCache()
}

// ❌ Avoid: Mixing promises and async/await
async onServiceInit() {
  this.connection = await this.connect()
  this.cache = this.initializeCache() // Missing await
}
```

### 4. Clean Up in Reverse Order

```typescript
// ✅ Good: Clean up in reverse order of initialization
async onServiceDestroy() {
  // Clean up in reverse order
  await this.cleanupResource3()
  await this.cleanupResource2()
  await this.cleanupResource1()
}
```

### 5. Don't Block Initialization

```typescript
// ✅ Good: Don't block on non-critical operations
async onServiceInit() {
  // Critical initialization
  this.connection = await this.connect()

  // Non-critical operations can be done asynchronously
  this.initializeMetrics().catch(error => {
    console.error('Failed to initialize metrics:', error)
  })
}
```

## API Reference

### OnServiceInit Interface

```typescript
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}
```

### OnServiceDestroy Interface

```typescript
interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

### Lifecycle Order

1. **Service Creation**: Constructor is called
2. **Dependency Injection**: Dependencies are injected
3. **onServiceInit**: Called after all dependencies are resolved
4. **Service Usage**: Service is ready for use
5. **onServiceDestroy**: Called when service is being destroyed
6. **Cleanup**: Resources are cleaned up
