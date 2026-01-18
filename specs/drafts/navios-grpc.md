# @navios/grpc Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/grpc` provides gRPC server and client capabilities for the Navios framework. It enables high-performance, type-safe RPC communication between services using Protocol Buffers.

**Package:** `@navios/grpc`
**Version:** 0.1.0 (planned)
**License:** MIT
**Dependencies:** `@grpc/grpc-js`, `@grpc/proto-loader`
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Key Features (Planned)

- **Proto-first design** - Generate TypeScript from .proto files
- **Decorator-based services** - Define gRPC services using decorators
- **DI integration** - Full dependency injection support
- **Streaming support** - Unary, server streaming, client streaming, bidirectional
- **Interceptors** - Request/response interceptors
- **Health checks** - gRPC health checking protocol
- **Reflection** - gRPC reflection for debugging

---

## Proposed API

### Server Setup

```typescript
import { Module } from '@navios/core'
import { GrpcModule } from '@navios/grpc'

@Module({
  imports: [
    GrpcModule.register({
      protoPath: './protos/service.proto',
      package: 'myapp',
      url: '0.0.0.0:5000',
    }),
  ],
})
class AppModule {}
```

### Service Definition

```typescript
import { GrpcService, GrpcMethod, GrpcStreamMethod } from '@navios/grpc'
import { Injectable, inject } from '@navios/di'

@GrpcService('UserService')
@Injectable()
class UserGrpcService {
  private userService = inject(UserService)

  @GrpcMethod()
  async getUser(request: GetUserRequest): Promise<User> {
    return this.userService.findById(request.id)
  }

  @GrpcMethod()
  async createUser(request: CreateUserRequest): Promise<User> {
    return this.userService.create(request)
  }

  @GrpcStreamMethod()
  async listUsers(request: ListUsersRequest): AsyncIterable<User> {
    const users = await this.userService.findAll(request.filter)
    for (const user of users) {
      yield user
    }
  }

  @GrpcStreamMethod('bidirectional')
  async chat(
    messages: AsyncIterable<ChatMessage>
  ): AsyncIterable<ChatMessage> {
    for await (const message of messages) {
      yield {
        text: `Echo: ${message.text}`,
        timestamp: Date.now(),
      }
    }
  }
}
```

### Client Usage

```typescript
import { Injectable, inject } from '@navios/di'
import { GrpcClient, InjectGrpcClient } from '@navios/grpc'

@Injectable()
class OrderService {
  @InjectGrpcClient('UserService')
  private userClient!: UserServiceClient

  async processOrder(userId: string, items: OrderItem[]) {
    // Type-safe gRPC call
    const user = await this.userClient.getUser({ id: userId })

    // Streaming
    const users = this.userClient.listUsers({ filter: {} })
    for await (const user of users) {
      console.log(user)
    }
  }
}
```

### Proto File Example

```protobuf
syntax = "proto3";

package myapp;

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (stream User);
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

message User {
  string id = 1;
  string email = 2;
  string name = 3;
}

message GetUserRequest {
  string id = 1;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
}

message ListUsersRequest {
  map<string, string> filter = 1;
}

message ChatMessage {
  string text = 1;
  int64 timestamp = 2;
}
```

---

## Architecture Considerations

### Code Generation

Two approaches under consideration:

1. **Proto-first**: Generate TypeScript from .proto files
   - Pro: Standard gRPC workflow, language-agnostic
   - Con: Additional build step

2. **Code-first**: Generate .proto from TypeScript decorators
   - Pro: Single source of truth, better DX
   - Con: Non-standard, potential compatibility issues

### Interceptors

```typescript
import { GrpcInterceptor, GrpcCallHandler } from '@navios/grpc'

@Injectable()
class LoggingInterceptor implements GrpcInterceptor {
  async intercept(call: GrpcCall, next: GrpcCallHandler) {
    const start = Date.now()
    console.log(`gRPC ${call.method} started`)

    try {
      const result = await next.handle(call)
      console.log(`gRPC ${call.method} completed in ${Date.now() - start}ms`)
      return result
    } catch (error) {
      console.error(`gRPC ${call.method} failed:`, error)
      throw error
    }
  }
}
```

### Error Handling

```typescript
import { GrpcException, GrpcStatus } from '@navios/grpc'

@GrpcService('UserService')
class UserGrpcService {
  @GrpcMethod()
  async getUser(request: GetUserRequest): Promise<User> {
    const user = await this.userService.findById(request.id)

    if (!user) {
      throw new GrpcException(
        GrpcStatus.NOT_FOUND,
        `User ${request.id} not found`
      )
    }

    return user
  }
}
```

---

## Open Questions

1. **Proto loading**: Runtime loading vs compile-time generation?
2. **Type safety**: How to best integrate with Zod schemas?
3. **Transport**: Support for gRPC-Web for browser clients?
4. **Integration**: How to share types with REST endpoints?
5. **Testing**: Mock gRPC services for testing?

---

## Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `@grpc/grpc-js` | ^1.x | gRPC implementation |
| `@grpc/proto-loader` | ^0.7.x | Proto file loading |
| `protobufjs` | ^7.x | Optional: Code generation |

---

## Related Packages

- `@navios/microservice` - Higher-level microservice patterns
- `@navios/queues` - Message queue integration
- `@navios/health` - gRPC health checking protocol

---

## Implementation Priority

- [ ] Basic server setup and service registration
- [ ] Unary RPC methods
- [ ] Server streaming
- [ ] Client generation
- [ ] Interceptors
- [ ] Client streaming
- [ ] Bidirectional streaming
- [ ] Health checking
- [ ] Reflection
- [ ] gRPC-Web support
