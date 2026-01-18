# @navios/health Specification

## Overview

`@navios/health` is a health check library for the Navios framework. It provides configurable health indicators for monitoring application health, readiness, and liveness - essential for containerized deployments and load balancers.

**Package:** `@navios/health`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Core Concepts

### Architecture Overview

```
HealthModule
├── HealthService (main service)
│   ├── check(indicators) - Run health checks
│   ├── getStatus() - Get overall status
│   └── isHealthy() - Quick health check
│
├── Built-in Indicators
│   ├── DiskHealthIndicator - Disk space
│   ├── MemoryHealthIndicator - Memory usage
│   ├── HttpHealthIndicator - External HTTP services
│   ├── DatabaseHealthIndicator - Database connectivity
│   ├── RedisHealthIndicator - Redis connectivity
│   ├── MicroserviceHealthIndicator - Microservice health
│   └── Custom indicators via HealthIndicator interface
│
├── Endpoints
│   ├── /health - Overall health
│   ├── /health/live - Liveness probe
│   └── /health/ready - Readiness probe
│
└── Features
    ├── Graceful degradation
    ├── Timeout handling
    ├── Caching
    └── OpenAPI integration
```

### Key Principles

- **Kubernetes Compatible** - Liveness and readiness probes
- **DI Integration** - Injectable indicators via @navios/di
- **Extensible** - Custom health indicators
- **Graceful Degradation** - Partial health reporting
- **Performance** - Caching and timeouts

---

## Setup

### Basic Configuration

```typescript
import { Module } from '@navios/core'
import { HealthModule } from '@navios/health'

@Module({
  imports: [
    HealthModule.register({
      // Automatically expose /health, /health/live, /health/ready
      endpoints: true,
    }),
  ],
})
class AppModule {}
```

### With Built-in Indicators

```typescript
import { Module } from '@navios/core'
import {
  HealthModule,
  DiskHealthIndicator,
  MemoryHealthIndicator,
  HttpHealthIndicator,
} from '@navios/health'

@Module({
  imports: [
    HealthModule.register({
      endpoints: true,
      indicators: [
        // Check disk space (fail if < 10% free)
        new DiskHealthIndicator({
          path: '/',
          thresholdPercent: 10,
        }),

        // Check memory (fail if > 90% used)
        new MemoryHealthIndicator({
          heapThresholdPercent: 90,
          rssThresholdPercent: 90,
        }),

        // Check external service
        new HttpHealthIndicator({
          name: 'api-gateway',
          url: 'https://api.example.com/health',
          timeout: 3000,
        }),
      ],
    }),
  ],
})
class AppModule {}
```

### With Database Indicators

```typescript
import { Module } from '@navios/core'
import {
  HealthModule,
  DatabaseHealthIndicator,
  RedisHealthIndicator,
} from '@navios/health'
import { inject } from '@navios/di'

@Module({
  imports: [
    HealthModule.registerAsync({
      useFactory: async () => {
        const prisma = await inject(PrismaClient)
        const redis = await inject(RedisClient)

        return {
          endpoints: true,
          indicators: [
            new DatabaseHealthIndicator({
              name: 'database',
              connection: prisma,
            }),
            new RedisHealthIndicator({
              name: 'cache',
              client: redis,
            }),
          ],
        }
      },
    }),
  ],
})
class AppModule {}
```

---

## Health Endpoints

### Default Endpoints

When `endpoints: true`, the following endpoints are automatically registered:

| Endpoint         | Purpose           | Response                    |
| ---------------- | ----------------- | --------------------------- |
| `GET /health`    | Overall health    | Full status with details    |
| `GET /health/live` | Liveness probe  | Simple up/down              |
| `GET /health/ready`| Readiness probe | Checks all indicators       |

### Response Format

**Healthy Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "details": {
    "database": {
      "status": "healthy",
      "responseTime": 15
    },
    "cache": {
      "status": "healthy",
      "responseTime": 2
    },
    "disk": {
      "status": "healthy",
      "freePercent": 45.2,
      "freeBytes": 107374182400
    },
    "memory": {
      "status": "healthy",
      "heapUsedPercent": 65.3,
      "rssUsedPercent": 42.1
    }
  }
}
```

**Unhealthy Response (503):**

```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "details": {
    "database": {
      "status": "unhealthy",
      "error": "Connection refused",
      "responseTime": 5000
    },
    "cache": {
      "status": "healthy",
      "responseTime": 2
    }
  }
}
```

### Customizing Endpoints

```typescript
HealthModule.register({
  endpoints: {
    path: '/status',           // Base path
    livePath: '/status/live',  // Liveness path
    readyPath: '/status/ready',// Readiness path

    // Require authentication for health details
    guards: [ApiKeyGuard],

    // Hide details in response
    hideDetails: process.env.NODE_ENV === 'production',
  },
})
```

### Manual Endpoint Registration

```typescript
import { Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'
import { HealthService } from '@navios/health'

@Controller()
class HealthController {
  private health = inject(HealthService)

  @Endpoint(healthCheck)
  async check() {
    return this.health.check()
  }

  @Endpoint(livenessProbe)
  async live() {
    // Simple check - is the process running?
    return { status: 'ok' }
  }

  @Endpoint(readinessProbe)
  async ready() {
    const result = await this.health.check()

    if (result.status !== 'healthy') {
      throw new ServiceUnavailableException(result)
    }

    return result
  }
}
```

---

## Built-in Health Indicators

### DiskHealthIndicator

Checks available disk space.

```typescript
import { DiskHealthIndicator } from '@navios/health'

new DiskHealthIndicator({
  name: 'disk',              // Indicator name
  path: '/',                 // Path to check
  thresholdPercent: 10,      // Fail if less than 10% free
  thresholdBytes: 1073741824,// Or fail if less than 1GB free
})
```

**Response:**

```json
{
  "status": "healthy",
  "freePercent": 45.2,
  "freeBytes": 107374182400,
  "totalBytes": 237580963840
}
```

### MemoryHealthIndicator

Checks memory usage.

```typescript
import { MemoryHealthIndicator } from '@navios/health'

new MemoryHealthIndicator({
  name: 'memory',
  heapThresholdPercent: 90,  // Fail if heap > 90% used
  rssThresholdPercent: 90,   // Fail if RSS > 90% used
})
```

**Response:**

```json
{
  "status": "healthy",
  "heapUsed": 52428800,
  "heapTotal": 104857600,
  "heapUsedPercent": 50.0,
  "rss": 134217728,
  "rssUsedPercent": 25.0
}
```

### HttpHealthIndicator

Checks external HTTP service availability.

```typescript
import { HttpHealthIndicator } from '@navios/health'

new HttpHealthIndicator({
  name: 'payment-service',
  url: 'https://payment.example.com/health',
  timeout: 5000,             // 5 second timeout
  expectedStatus: 200,       // Expected status code
  headers: {                 // Optional headers
    'Authorization': 'Bearer token',
  },
})
```

**Response:**

```json
{
  "status": "healthy",
  "responseTime": 125,
  "statusCode": 200
}
```

### DatabaseHealthIndicator

Checks database connectivity.

```typescript
import { DatabaseHealthIndicator } from '@navios/health'

// With Prisma
new DatabaseHealthIndicator({
  name: 'database',
  connection: prismaClient,
  timeout: 5000,
})

// With custom query
new DatabaseHealthIndicator({
  name: 'database',
  pingQuery: async () => {
    await db.query('SELECT 1')
  },
  timeout: 5000,
})
```

**Response:**

```json
{
  "status": "healthy",
  "responseTime": 15
}
```

### RedisHealthIndicator

Checks Redis connectivity.

```typescript
import { RedisHealthIndicator } from '@navios/health'

new RedisHealthIndicator({
  name: 'cache',
  client: redisClient,  // ioredis client
  timeout: 3000,
})
```

**Response:**

```json
{
  "status": "healthy",
  "responseTime": 2
}
```

### MicroserviceHealthIndicator

Checks microservice health via message bus.

```typescript
import { MicroserviceHealthIndicator } from '@navios/health'

new MicroserviceHealthIndicator({
  name: 'user-service',
  client: microserviceClient,
  pattern: 'health.check',
  timeout: 5000,
})
```

---

## Custom Health Indicators

### Using @HealthCheck Decorator

```typescript
import { Injectable, inject } from '@navios/di'
import { HealthCheck, HealthIndicatorResult } from '@navios/health'

@Injectable()
class CustomHealthIndicator {
  private externalService = inject(ExternalService)

  @HealthCheck('external-api')
  async check(): Promise<HealthIndicatorResult> {
    try {
      const start = Date.now()
      await this.externalService.ping()
      const responseTime = Date.now() - start

      return {
        status: 'healthy',
        responseTime,
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      }
    }
  }
}
```

### Implementing HealthIndicator Interface

```typescript
import { HealthIndicator, HealthIndicatorResult } from '@navios/health'

class QueueHealthIndicator implements HealthIndicator {
  name = 'queue'

  constructor(private queueClient: QueueClient) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      const stats = await this.queueClient.getStats()

      // Check if queue is backed up
      if (stats.pending > 10000) {
        return {
          status: 'degraded',
          pending: stats.pending,
          warning: 'Queue backlog exceeds threshold',
        }
      }

      return {
        status: 'healthy',
        pending: stats.pending,
        processed: stats.processed,
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      }
    }
  }
}
```

### Registering Custom Indicators

```typescript
import { Module } from '@navios/core'
import { HealthModule } from '@navios/health'

@Module({
  imports: [
    HealthModule.register({
      endpoints: true,
      indicators: [
        new QueueHealthIndicator(queueClient),
      ],
      // Or register as providers for DI
      indicatorProviders: [
        CustomHealthIndicator,
      ],
    }),
  ],
})
class AppModule {}
```

---

## HealthService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { HealthService } from '@navios/health'

@Injectable()
class MonitoringService {
  private health = inject(HealthService)
}
```

### check(indicators?)

Runs health checks and returns detailed results.

```typescript
// Check all registered indicators
const result = await this.health.check()

// Check specific indicators
const result = await this.health.check(['database', 'cache'])

// Response
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  timestamp: Date,
  details: {
    [indicatorName]: HealthIndicatorResult
  }
}
```

### isHealthy()

Quick boolean health check.

```typescript
if (await this.health.isHealthy()) {
  // All systems operational
}
```

### getStatus()

Get current cached status (doesn't re-run checks).

```typescript
const status = this.health.getStatus()
```

### registerIndicator(indicator)

Dynamically register a health indicator.

```typescript
this.health.registerIndicator(new CustomIndicator())
```

### unregisterIndicator(name)

Remove a health indicator.

```typescript
this.health.unregisterIndicator('external-api')
```

---

## Health Status Types

### Status Levels

| Status      | HTTP Code | Description                           |
| ----------- | --------- | ------------------------------------- |
| `healthy`   | 200       | All indicators passing                |
| `degraded`  | 200       | Some non-critical indicators failing  |
| `unhealthy` | 503       | Critical indicators failing           |

### Configuring Criticality

```typescript
HealthModule.register({
  indicators: [
    // Critical - will cause unhealthy status
    new DatabaseHealthIndicator({
      name: 'database',
      connection: prisma,
      critical: true, // Default
    }),

    // Non-critical - will cause degraded status
    new HttpHealthIndicator({
      name: 'analytics',
      url: 'https://analytics.example.com/health',
      critical: false,
    }),
  ],
})
```

---

## Caching and Timeouts

### Response Caching

Prevent excessive health check calls.

```typescript
HealthModule.register({
  cache: {
    ttl: 5000, // Cache results for 5 seconds
  },
})
```

### Global Timeout

Set maximum time for health checks.

```typescript
HealthModule.register({
  timeout: 10000, // 10 second global timeout
})
```

### Per-Indicator Timeout

```typescript
new HttpHealthIndicator({
  name: 'slow-service',
  url: 'https://slow.example.com/health',
  timeout: 30000, // 30 second timeout for this indicator
})
```

---

## Kubernetes Integration

### Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
```

### Graceful Shutdown

```typescript
import { Module, OnModuleDestroy } from '@navios/core'
import { HealthService } from '@navios/health'
import { inject } from '@navios/di'

@Module({})
class AppModule implements OnModuleDestroy {
  private health = inject(HealthService)

  async onModuleDestroy() {
    // Mark as unhealthy during shutdown
    // Kubernetes will stop routing traffic
    this.health.setShuttingDown()

    // Wait for in-flight requests
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
```

---

## OpenAPI Integration

Automatically document health endpoints.

```typescript
import { Module } from '@navios/core'
import { HealthModule } from '@navios/health'
import { OpenApiModule } from '@navios/openapi'

@Module({
  imports: [
    OpenApiModule.register({ /* ... */ }),
    HealthModule.register({
      endpoints: true,
      openapi: {
        // Add to OpenAPI spec
        enabled: true,
        tags: ['Health'],
      },
    }),
  ],
})
class AppModule {}
```

---

## Complete Example

```typescript
// health.config.ts
import {
  HealthModule,
  DiskHealthIndicator,
  MemoryHealthIndicator,
  HttpHealthIndicator,
  DatabaseHealthIndicator,
  RedisHealthIndicator,
} from '@navios/health'
import { inject } from '@navios/di'

export const healthConfig = HealthModule.registerAsync({
  useFactory: async () => {
    const prisma = await inject(PrismaClient)
    const redis = await inject(RedisClient)
    const config = await inject(ConfigService)

    return {
      endpoints: {
        path: '/health',
        hideDetails: config.isProduction,
      },
      cache: {
        ttl: 5000,
      },
      timeout: 10000,
      indicators: [
        // System indicators
        new DiskHealthIndicator({
          name: 'disk',
          path: '/',
          thresholdPercent: 10,
        }),
        new MemoryHealthIndicator({
          name: 'memory',
          heapThresholdPercent: 90,
        }),

        // Infrastructure indicators
        new DatabaseHealthIndicator({
          name: 'database',
          connection: prisma,
          critical: true,
        }),
        new RedisHealthIndicator({
          name: 'cache',
          client: redis,
          critical: true,
        }),

        // External services (non-critical)
        new HttpHealthIndicator({
          name: 'payment-gateway',
          url: config.paymentGateway.healthUrl,
          timeout: 5000,
          critical: false,
        }),
        new HttpHealthIndicator({
          name: 'email-service',
          url: config.emailService.healthUrl,
          timeout: 5000,
          critical: false,
        }),
      ],
    }
  },
})
```

```typescript
// services/monitoring.service.ts
import { Injectable, inject } from '@navios/di'
import { HealthService, HealthCheck } from '@navios/health'
import { Cron, Schedule } from '@navios/schedule'

@Injectable()
class MonitoringService {
  private health = inject(HealthService)
  private alerting = inject(AlertingService)
  private metrics = inject(MetricsService)

  @Cron(Schedule.EveryMinute)
  async checkAndReport() {
    const result = await this.health.check()

    // Record metrics
    this.metrics.gauge('health.status', result.status === 'healthy' ? 1 : 0)

    for (const [name, indicator] of Object.entries(result.details)) {
      if (indicator.responseTime) {
        this.metrics.histogram('health.response_time', indicator.responseTime, {
          indicator: name,
        })
      }
    }

    // Alert on unhealthy
    if (result.status === 'unhealthy') {
      await this.alerting.send({
        severity: 'critical',
        title: 'Service Unhealthy',
        details: result,
      })
    }
  }
}

// Custom health indicator
@Injectable()
class QueueHealthIndicator {
  private queue = inject(QueueService)

  @HealthCheck('queue')
  async check() {
    const stats = await this.queue.getStats()

    if (stats.pending > 10000) {
      return {
        status: 'degraded',
        pending: stats.pending,
        warning: 'Queue backlog high',
      }
    }

    return {
      status: 'healthy',
      pending: stats.pending,
      processed: stats.processed,
    }
  }
}
```

```typescript
// modules/app.module.ts
import { Module } from '@navios/core'

@Module({
  imports: [healthConfig],
  providers: [MonitoringService, QueueHealthIndicator],
})
class AppModule {}
```

---

## API Reference Summary

### Module Exports

| Export                       | Type       | Description                    |
| ---------------------------- | ---------- | ------------------------------ |
| `HealthModule`               | Module     | Health module configuration    |
| `HealthService`              | Class      | Main health service            |
| `HealthCheck`                | Decorator  | Mark method as health check    |
| `DiskHealthIndicator`        | Class      | Disk space indicator           |
| `MemoryHealthIndicator`      | Class      | Memory usage indicator         |
| `HttpHealthIndicator`        | Class      | HTTP service indicator         |
| `DatabaseHealthIndicator`    | Class      | Database indicator             |
| `RedisHealthIndicator`       | Class      | Redis indicator                |
| `MicroserviceHealthIndicator`| Class      | Microservice indicator         |

### HealthService Methods

| Method               | Return                  | Description                |
| -------------------- | ----------------------- | -------------------------- |
| `check`              | `Promise<HealthResult>` | Run health checks          |
| `isHealthy`          | `Promise<boolean>`      | Quick health check         |
| `getStatus`          | `HealthResult`          | Get cached status          |
| `registerIndicator`  | `void`                  | Add indicator              |
| `unregisterIndicator`| `void`                  | Remove indicator           |
| `setShuttingDown`    | `void`                  | Mark as shutting down      |

### HealthIndicatorResult Type

| Property       | Type                                | Description            |
| -------------- | ----------------------------------- | ---------------------- |
| `status`       | `'healthy' \| 'degraded' \| 'unhealthy'` | Health status    |
| `responseTime` | `number`                            | Check duration (ms)    |
| `error`        | `string`                            | Error message          |
| `[key]`        | `unknown`                           | Additional data        |

### Configuration Options

| Property     | Type                 | Default | Description                |
| ------------ | -------------------- | ------- | -------------------------- |
| `endpoints`  | `boolean \| object`  | `false` | Enable health endpoints    |
| `indicators` | `HealthIndicator[]`  | `[]`    | Health indicators          |
| `cache`      | `{ ttl: number }`    | -       | Response caching           |
| `timeout`    | `number`             | `10000` | Global timeout (ms)        |
