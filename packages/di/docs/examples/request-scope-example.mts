/**
 * Example demonstrating the Request scope functionality in Navios DI.
 *
 * This example shows how to use request-scoped services for web applications
 * where you need services that are shared within a request but isolated between requests.
 */

import { Container } from '../../src/container/container.mjs'
import { Injectable } from '../../src/decorators/injectable.decorator.mjs'
import { InjectableScope } from '../../src/enums/index.mjs'
import { inject } from '../../src/injectors.mjs'

// ============================================================================
// EXAMPLE SERVICES
// ============================================================================

/**
 * Singleton service - shared across the entire application
 */
@Injectable({ scope: InjectableScope.Singleton })
class DatabaseService {
  private connectionCount = 0

  async getConnection() {
    this.connectionCount++
    console.log(`[DatabaseService] Created connection #${this.connectionCount}`)
    return {
      id: this.connectionCount,
      connected: true,
      createdAt: new Date(),
    }
  }

  getConnectionCount() {
    return this.connectionCount
  }
}

/**
 * Request-scoped service - shared within a request, isolated between requests
 */
@Injectable({ scope: InjectableScope.Request })
class UserContext {
  public readonly requestId: string
  public readonly userId: string
  public readonly sessionId: string
  public readonly startTime: number
  private readonly database = inject(DatabaseService)

  constructor({ userId, sessionId }: { userId: string; sessionId: string }) {
    this.requestId = Math.random().toString(36).substring(2, 15)
    this.userId = userId
    this.sessionId = sessionId
    this.startTime = Date.now()

    console.log(`[UserContext] Created for user ${userId} in request ${this.requestId}`)
  }

  async getDatabaseConnection() {
    const db = await this.database
    return await db.getConnection()
  }

  getRequestDuration() {
    return Date.now() - this.startTime
  }

  async onServiceDestroy() {
    console.log(
      `[UserContext] Destroying context for user ${this.userId} (request ${this.requestId})`,
    )
  }
}

/**
 * Request-scoped service that depends on UserContext
 */
@Injectable({ scope: InjectableScope.Request })
class OrderService {
  private readonly userContext = inject(UserContext)
  private orders: string[] = []

  async createOrder(productName: string) {
    const userCtx = await this.userContext
    const orderId = `order_${Math.random().toString(36).substring(2, 15)}`

    this.orders.push(orderId)
    console.log(`[OrderService] Created order ${orderId} for user ${userCtx.userId}`)

    return {
      orderId,
      userId: userCtx.userId,
      productName,
      requestId: userCtx.requestId,
    }
  }

  getOrders() {
    return [...this.orders]
  }
}

/**
 * Transient service - new instance for each injection
 */
@Injectable({ scope: InjectableScope.Transient })
class LoggerService {
  private readonly logId = Math.random().toString(36).substring(2, 15)

  log(message: string) {
    console.log(`[LoggerService:${this.logId}] ${message}`)
  }
}

/**
 * Service that uses all scopes
 */
@Injectable({ scope: InjectableScope.Singleton })
class RequestHandler {
  private readonly logger = inject(LoggerService)
  private readonly userContext = inject(UserContext)
  private readonly orderService = inject(OrderService)

  async handleRequest(userId: string, _sessionId: string) {
    const logger = await this.logger
    logger.log(`Handling request for user ${userId}`)

    const userCtx = await this.userContext
    logger.log(`User context request ID: ${userCtx.requestId}`)

    const orderSvc = await this.orderService
    const order = await orderSvc.createOrder('Sample Product')

    logger.log(`Created order: ${order.orderId}`)
    logger.log(`Request duration: ${userCtx.getRequestDuration()}ms`)

    return {
      userId: userCtx.userId,
      requestId: userCtx.requestId,
      orderId: order.orderId,
      duration: userCtx.getRequestDuration(),
    }
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function demonstrateRequestScope() {
  console.log('🚀 Request Scope Example\n')

  const container = new Container()

  // Simulate multiple requests
  const requests = [
    { userId: 'user1', sessionId: 'session1' },
    { userId: 'user2', sessionId: 'session2' },
    { userId: 'user1', sessionId: 'session3' }, // Same user, different session
  ]

  for (let i = 0; i < requests.length; i++) {
    const { userId, sessionId } = requests[i]

    console.log(`\n📝 Processing Request ${i + 1}: User ${userId}, Session ${sessionId}`)
    console.log('─'.repeat(50))

    // Begin request context
    const requestId = `req_${i + 1}`
    container.beginRequest(requestId, { userId, sessionId })

    // Handle the request
    const handler = await container.get(RequestHandler)
    const result = await handler.handleRequest(userId, sessionId)

    console.log(`✅ Request completed:`, result)

    // End request context (cleans up request-scoped instances)
    await container.endRequest(requestId)

    console.log('─'.repeat(50))
  }

  // Show that singleton services persist across requests
  const dbService = await container.get(DatabaseService)
  console.log(`\n📊 Total database connections created: ${dbService.getConnectionCount()}`)

  console.log('\n✨ Example completed!')
}

// ============================================================================
// PERFORMANCE COMPARISON
// ============================================================================

async function demonstratePerformanceBenefits() {
  console.log('\n⚡ Performance Comparison\n')

  const container = new Container()

  // Without pre-preparation
  console.log('🐌 Without pre-preparation:')
  const start1 = Date.now()

  container.beginRequest('perf-test-1')
  const handler1 = await container.get(RequestHandler)
  await handler1.handleRequest('user1', 'session1')
  await container.endRequest('perf-test-1')

  const time1 = Date.now() - start1
  console.log(`   Time: ${time1}ms`)

  // With pre-preparation
  console.log('🚀 With pre-preparation:')
  const start2 = Date.now()

  container.beginRequest('perf-test-2')
  const handler2 = await container.get(RequestHandler)
  await handler2.handleRequest('user1', 'session1')
  await container.endRequest('perf-test-2')

  const time2 = Date.now() - start2
  console.log(`   Time: ${time2}ms`)
  console.log(`   Improvement: ${(((time1 - time2) / time1) * 100).toFixed(1)}% faster`)
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRequestScope()
    .then(() => demonstratePerformanceBenefits())
    .catch(console.error)
}

export {
  DatabaseService,
  UserContext,
  OrderService,
  LoggerService,
  RequestHandler,
  demonstrateRequestScope,
  demonstratePerformanceBenefits,
}
