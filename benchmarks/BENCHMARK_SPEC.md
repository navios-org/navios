# Navios vs NestJS Benchmark Specification

## Overview

This document defines the standardized benchmark rules, endpoints, and methodology for comparing `@navios/core` against NestJS across different HTTP adapters.

## Frameworks Under Test

| Framework | Adapter | Description |
|-----------|---------|-------------|
| `@navios/core` | Fastify (`@navios/openapi-fastify`) | Navios with Fastify adapter |
| `@navios/core` | Bun (`@navios/openapi-bun`) | Navios with native Bun adapter |
| NestJS | Express (default) | NestJS with Express adapter |
| NestJS | Fastify | NestJS with Fastify adapter |

## Benchmark Types

### 1. HTTP Throughput
- **Metric**: Requests per second (RPS)
- **Latency Percentiles**: p50, p75, p90, p95, p99
- **Tool**: autocannon
- **Duration**: 30 seconds per test
- **Connections**: 10, 50, 100, 250

### 2. Startup Time
- **Metric**: Time from process start to first successful request
- **Methodology**: Multiple runs (10x) with median calculation
- **Measured Events**:
  - Process spawn
  - Module initialization complete
  - First HTTP request served

### 3. Memory Usage
- **Idle Memory**: Memory consumption at startup (no load)
- **Under Load**: Memory during sustained traffic
- **Peak Memory**: Maximum memory during stress test
- **Tool**: Node.js `process.memoryUsage()` + external monitoring

## Standardized Endpoints

All benchmark applications MUST implement these identical endpoints:

### 1. Health Check - `GET /health`
**Purpose**: Minimal overhead endpoint for raw framework performance

```typescript
// Response
{ "status": "ok" }
```

### 2. JSON Serialization - `GET /json`
**Purpose**: Test JSON serialization performance with moderate payload

```typescript
// Response
{
  "message": "Hello, World!",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "id": 1,
    "name": "benchmark",
    "values": [1, 2, 3, 4, 5]
  }
}
```

### 3. Path Parameters - `GET /users/:id`
**Purpose**: Test URL parameter parsing

```typescript
// Request: GET /users/123
// Response
{
  "id": "123",
  "name": "User 123",
  "email": "user123@example.com"
}
```

### 4. Query Parameters - `GET /search`
**Purpose**: Test query string parsing with multiple parameters

```typescript
// Request: GET /search?q=test&page=1&limit=10
// Response
{
  "query": "test",
  "page": 1,
  "limit": 10,
  "results": []
}
```

### 5. POST with JSON Body - `POST /users`
**Purpose**: Test request body parsing and validation

```typescript
// Request Body
{
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30
}

// Response (201 Created)
{
  "id": "usr_1",
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### 6. Service Layer - `GET /posts`
**Purpose**: Test dependency injection and service layer overhead

```typescript
// Response (paginated list from injected service)
{
  "posts": [
    { "id": "1", "title": "Post 1", "content": "..." },
    { "id": "2", "title": "Post 2", "content": "..." }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 10
}
```

### 7. Nested Route with Guard - `GET /admin/stats`
**Purpose**: Test middleware/guard overhead

```typescript
// Response (requires passing through a guard)
{
  "totalUsers": 1000,
  "activeUsers": 750,
  "requestsToday": 50000
}
```

### 8. Large JSON Response - `GET /data/large`
**Purpose**: Test serialization performance with large payloads

```typescript
// Response (array of 1000 items)
{
  "items": [
    { "id": 1, "name": "Item 1", "description": "...", "metadata": {...} },
    // ... 1000 items
  ]
}
```

## Service Layer Requirements

Each application MUST have:

1. **UserService** - Injectable service with in-memory data store
2. **PostService** - Injectable service demonstrating service composition
3. **StatsService** - Injectable service for admin stats

Services should use the framework's native dependency injection.

## Guard/Middleware Requirements

1. **LoggerMiddleware/Interceptor** - Logs request timing (can be disabled for pure benchmarks)
2. **AuthGuard** - Simple guard that always passes (measures guard overhead)

## Module Structure

```
app/
├── app.module.ts          # Root module
├── health/
│   └── health.controller.ts
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   └── users.service.ts
├── posts/
│   ├── posts.module.ts
│   ├── posts.controller.ts
│   └── posts.service.ts
├── admin/
│   ├── admin.module.ts
│   ├── admin.controller.ts
│   ├── admin.guard.ts
│   └── stats.service.ts
└── data/
    └── data.controller.ts
```

## Benchmark Scenarios

### Scenario 1: Cold Start
- Measure time from `node app.js` to first successful `/health` response
- Run 10 iterations, report median

### Scenario 2: Light Load
- 10 concurrent connections
- 30 seconds duration
- All endpoints tested sequentially

### Scenario 3: Moderate Load
- 100 concurrent connections
- 30 seconds duration
- Focus on `/health`, `/json`, `/users/:id`

### Scenario 4: Heavy Load
- 250 concurrent connections
- 60 seconds duration
- Focus on `/health` only (pure throughput)

### Scenario 5: Sustained Load (Memory)
- 50 concurrent connections
- 5 minutes duration
- Memory sampled every 5 seconds
- All endpoints in rotation

## Environment Requirements

- **Node.js**: v20+ (LTS)
- **Bun**: v1.1+
- **Hardware**: Results should include CPU/RAM specs
- **Isolation**: No other significant processes running
- **Warmup**: 5-second warmup before measurements

## Output Format

Results should be output in JSON format for easy comparison:

```json
{
  "framework": "navios",
  "adapter": "fastify",
  "scenario": "moderate_load",
  "endpoint": "/users/:id",
  "results": {
    "requests": {
      "total": 150000,
      "average": 5000,
      "min": 4500,
      "max": 5500
    },
    "latency": {
      "p50": 2.5,
      "p75": 3.2,
      "p90": 5.1,
      "p95": 8.3,
      "p99": 15.2,
      "max": 45.0
    },
    "throughput": {
      "average": "1.2 MB/s",
      "total": "36 MB"
    },
    "errors": 0
  },
  "memory": {
    "heapUsed": "45 MB",
    "heapTotal": "65 MB",
    "external": "2 MB",
    "rss": "85 MB"
  },
  "environment": {
    "node": "v20.10.0",
    "os": "darwin arm64",
    "cpu": "Apple M1 Pro",
    "ram": "16 GB"
  }
}
```

## Fairness Rules

1. **Same validation**: All apps should validate input the same way (using Zod or equivalent)
2. **Same response format**: Identical JSON structure for each endpoint
3. **No caching tricks**: No response caching unless explicitly testing cache performance
4. **Production mode**: All apps run with `NODE_ENV=production`
5. **Same logging level**: Logging disabled or set to 'error' only during throughput tests
6. **Fresh process**: Each benchmark run starts a fresh process

## Directory Structure

```
benchmarks/
├── BENCHMARK_SPEC.md       # This file
├── package.json            # Shared dependencies
├── runner.ts               # Main benchmark runner
├── scenarios/              # Autocannon scenarios
│   ├── cold-start.ts
│   ├── light-load.ts
│   ├── moderate-load.ts
│   ├── heavy-load.ts
│   └── sustained-load.ts
├── apps/
│   ├── navios-fastify/     # Navios + Fastify app
│   ├── navios-bun/         # Navios + Bun app
│   ├── nestjs-express/     # NestJS + Express app
│   └── nestjs-fastify/     # NestJS + Fastify app
└── results/                # Benchmark output
    └── .gitkeep
```
