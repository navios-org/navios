---
sidebar_position: 2
---

# Database Connections

This recipe demonstrates how to manage database connections using dependency injection with proper lifecycle management.

## Basic Database Service

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Connecting to database...')
    this.connection = await this.connect()
    console.log('Database connected')
  }

  async onServiceDestroy() {
    console.log('Closing database connection...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Database connection logic
    return {
      connected: true,
      close: async () => {
        console.log('Connection closed')
      },
    }
  }

  async query(sql: string) {
    if (!this.connection) {
      throw new Error('Database not connected')
    }
    return `Query result: ${sql}`
  }
}
```

## Database Connection Pool

```typescript
@Injectable()
class DatabasePool implements OnServiceInit, OnServiceDestroy {
  private connections: any[] = []
  private maxConnections = 10

  async onServiceInit() {
    console.log('Initializing connection pool...')
    for (let i = 0; i < this.maxConnections; i++) {
      this.connections.push({ id: i, busy: false })
    }
  }

  async onServiceDestroy() {
    console.log('Closing connection pool...')
    this.connections = []
  }

  async getConnection() {
    const available = this.connections.find((conn) => !conn.busy)
    if (!available) {
      throw new Error('No available connections')
    }
    available.busy = true
    return available
  }

  releaseConnection(connection: any) {
    connection.busy = false
  }
}
```

## Repository Pattern

```typescript
@Injectable()
class UserRepository {
  private readonly db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`)
  }

  async create(userData: any) {
    return this.db.query(`INSERT INTO users VALUES ${JSON.stringify(userData)}`)
  }
}
```

