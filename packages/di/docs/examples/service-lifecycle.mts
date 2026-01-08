import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

import { asyncInject, Container, inject, Injectable } from '@navios/di'

const container = new Container()
/**
 * Service Lifecycle Example
 *
 * This example demonstrates:
 * - OnServiceInit interface
 * - OnServiceDestroy interface
 * - Service initialization and cleanup
 * - Resource management
 */

// 1. Service with initialization and cleanup
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null
  private isConnected = false

  async onServiceInit() {
    console.log('🔄 Initializing database service...')

    try {
      this.connection = await this.connect()
      this.isConnected = true
      console.log('✅ Database service initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize database service:', error)
      throw error
    }
  }

  async onServiceDestroy() {
    console.log('🔄 Destroying database service...')

    try {
      if (this.connection && this.isConnected) {
        await this.disconnect()
        this.isConnected = false
        console.log('✅ Database service destroyed successfully')
      } else {
        console.log('ℹ️ Database service was not connected')
      }
    } catch (error) {
      console.error('❌ Error during database service cleanup:', error)
    }
  }

  private async connect() {
    // Simulate database connection
    console.log('🔌 Connecting to database...')
    await new Promise((resolve) => setTimeout(resolve, 200))

    return {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      connected: true,
      connectTime: new Date(),
    }
  }

  private async disconnect() {
    // Simulate database disconnection
    console.log('🔌 Disconnecting from database...')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  async query(sql: string) {
    if (!this.isConnected) {
      throw new Error('Database not connected')
    }

    console.log(`📊 Executing query: ${sql}`)
    return { rows: [], query: sql, executedAt: new Date() }
  }
}

// 2. Service with multiple resources
@Injectable()
class CacheService implements OnServiceInit, OnServiceDestroy {
  private cache = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  }

  async onServiceInit() {
    console.log('🔄 Initializing cache service...')

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 30000) // Cleanup every 30 seconds

    console.log('✅ Cache service initialized successfully')
  }

  async onServiceDestroy() {
    console.log('🔄 Destroying cache service...')

    // Clear the cache
    this.cache.clear()

    // Clear the interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    console.log('✅ Cache service destroyed successfully')
    console.log('📊 Final cache stats:', this.stats)
  }

  set(key: string, value: any, ttl?: number) {
    const expires = ttl ? Date.now() + ttl : null
    this.cache.set(key, { value, expires })
    this.stats.sets++
  }

  get(key: string) {
    const item = this.cache.get(key)
    if (!item) {
      this.stats.misses++
      return null
    }

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return item.value
  }

  private cleanup() {
    const now = Date.now()
    let cleaned = 0

    for (const [key, item] of this.cache.entries()) {
      if (item.expires && now > item.expires) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleaned} expired entries`)
    }
  }

  getStats() {
    return { ...this.stats, size: this.cache.size }
  }
}

// 3. Service with conditional initialization
@Injectable()
class EmailService implements OnServiceInit, OnServiceDestroy {
  private smtpConnection: any = null
  private initialized = false

  async onServiceInit() {
    console.log('🔄 Initializing email service...')

    // Check if email service should be enabled
    const emailEnabled = process.env.EMAIL_ENABLED === 'true'

    if (emailEnabled) {
      try {
        this.smtpConnection = await this.connectToSmtp()
        this.initialized = true
        console.log('✅ Email service initialized successfully')
      } catch (error) {
        console.error('❌ Failed to initialize email service:', error)
        // Don't throw - let the service be created but mark it as failed
      }
    } else {
      console.log('ℹ️ Email service disabled by configuration')
    }
  }

  async onServiceDestroy() {
    console.log('🔄 Destroying email service...')

    if (this.initialized && this.smtpConnection) {
      try {
        await this.disconnectFromSmtp()
        console.log('✅ Email service destroyed successfully')
      } catch (error) {
        console.error('❌ Error during email service cleanup:', error)
      }
    } else {
      console.log('ℹ️ Email service was not initialized')
    }
  }

  private async connectToSmtp() {
    console.log('🔌 Connecting to SMTP server...')
    await new Promise((resolve) => setTimeout(resolve, 150))

    return {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      connected: true,
    }
  }

  private async disconnectFromSmtp() {
    console.log('🔌 Disconnecting from SMTP server...')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  async sendEmail(to: string, subject: string, _body: string) {
    if (!this.initialized) {
      throw new Error('Email service not initialized')
    }

    console.log(`📧 Sending email to ${to}: ${subject}`)
    return { success: true, messageId: Math.random().toString(36) }
  }
}

// 4. Service that depends on other services with lifecycle
@Injectable()
class UserService implements OnServiceInit, OnServiceDestroy {
  private readonly db = inject(DatabaseService)
  private readonly cache = inject(CacheService)
  private readonly email = asyncInject(EmailService)
  private initialized = false

  async onServiceInit() {
    console.log('🔄 Initializing user service...')

    // Wait for email service to be ready
    await this.email
    this.initialized = true

    console.log('✅ User service initialized successfully')
  }

  async onServiceDestroy() {
    console.log('🔄 Destroying user service...')

    // Clear user-related cache entries
    this.cache.set('users:count', null)
    this.cache.set('users:active', null)

    console.log('✅ User service destroyed successfully')
  }

  async createUser(name: string, email: string) {
    if (!this.initialized) {
      throw new Error('User service not initialized')
    }

    console.log(`👤 Creating user: ${name}`)

    // Check cache first
    const cached = this.cache.get(`user:${email}`)
    if (cached) {
      console.log('📋 User found in cache')
      return cached
    }

    // Create user in database
    const user = {
      id: Math.random().toString(36),
      name,
      email,
      createdAt: new Date(),
    }

    // Cache the user
    this.cache.set(`user:${email}`, user, 300000) // 5 minutes TTL

    // Send welcome email
    try {
      const emailService = await this.email
      await emailService.sendEmail(
        email,
        'Welcome!',
        `Hello ${name}, welcome to our platform!`,
      )
    } catch (error) {
      console.error('Failed to send welcome email:', error)
    }

    return user
  }

  async getUser(email: string) {
    // Check cache first
    const cached = this.cache.get(`user:${email}`)
    if (cached) {
      return cached
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM users WHERE email = '${email}'`,
    )
    return result.rows[0] || null
  }
}

// 5. Usage example
async function demonstrateLifecycle() {
  console.log('=== Service Lifecycle Example ===\n')

  // Create services (initialization happens automatically)
  const userService = await container.get(UserService)
  // oxlint-disable-next-line no-unused-vars
  const dbService = await container.get(DatabaseService)
  const cacheService = await container.get(CacheService)

  // Use the services
  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)

  // Check cache stats
  const stats = cacheService.getStats()
  console.log('Cache stats:', stats)

  // Simulate some work
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Get user from cache
  const cachedUser = await userService.getUser('alice@example.com')
  console.log('Retrieved user:', cachedUser)

  // Check updated cache stats
  const updatedStats = cacheService.getStats()
  console.log('Updated cache stats:', updatedStats)

  console.log('\n=== Service Cleanup ===')

  // Services will be cleaned up when the application shuts down
  // or when explicitly invalidated
}

// Main function
async function main() {
  await demonstrateLifecycle()
}

// Run the example
if (require.main === module) {
  main().catch(console.error)
}

export { DatabaseService, CacheService, EmailService, UserService }
