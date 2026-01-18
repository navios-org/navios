# @navios/ws Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/ws` provides WebSocket server capabilities for the Navios framework. It enables real-time bidirectional communication with support for rooms, broadcasting, and namespaces.

**Package:** `@navios/ws`
**Version:** 0.1.0 (planned)
**License:** MIT
**Dependencies:** `ws` (for Fastify adapter), native (for Bun)
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Key Features (Planned)

- **Gateway pattern** - Decorator-based WebSocket handlers
- **DI integration** - Full dependency injection support
- **Rooms & namespaces** - Group connections for broadcasting
- **Guards** - Authentication and authorization
- **Adapters** - Support for Redis adapter for horizontal scaling
- **Type safety** - Typed message payloads
- **Heartbeat** - Automatic connection health monitoring

---

## Proposed API

### Provider Function

The WebSocket service is configured using `provideWsService()` which returns an `InjectionToken`.

```typescript
import { provideWsService } from '@navios/ws'

const WsToken = provideWsService({
  // Heartbeat configuration
  heartbeat: {
    interval: 30000,
    timeout: 5000,
  },
  // CORS for WebSocket handshake
  cors: {
    origin: 'https://myapp.com',
  },
})

// Async configuration
const WsToken = provideWsService(async () => {
  const config = await loadConfig()
  return {
    heartbeat: config.ws.heartbeat,
    cors: config.ws.cors,
    adapter: config.redis.enabled
      ? new RedisWsAdapter({ host: config.redis.host })
      : undefined,
  }
})
```

### Module Registration

```typescript
import { Module } from '@navios/core'
import { provideWsService } from '@navios/ws'

const WsToken = provideWsService({
  heartbeat: {
    interval: 30000,
    timeout: 5000,
  },
})

@Module({
  providers: [WsToken, ChatGateway],
})
class AppModule {}
```

### Gateway Definition

```typescript
import { Injectable, inject } from '@navios/di'
import {
  WebSocketGateway,
  OnConnection,
  OnDisconnection,
  OnMessage,
  WsServer,
  WsClient,
  WsMessageParams,
} from '@navios/ws'

@WebSocketGateway({
  path: '/ws',
  namespace: '/chat',
})
@Injectable()
class ChatGateway {
  // Inject the WebSocket server
  private server = inject(WsServer)
  private userService = inject(UserService)

  @OnConnection()
  async handleConnection(client: WsClient) {
    console.log(`Client connected: ${client.id}`)

    // Authenticate and join rooms
    const user = await this.userService.findByToken(client.handshake.auth.token)
    if (user) {
      client.data.user = user
      client.join(`user:${user.id}`)
    }
  }

  @OnDisconnection()
  handleDisconnection(client: WsClient) {
    console.log(`Client disconnected: ${client.id}`)
  }

  @OnMessage('chat:message')
  async handleMessage(params: WsMessageParams<ChatMessagePayload>) {
    const { client, payload } = params

    // Broadcast to room
    this.server.to(payload.roomId).emit('chat:message', {
      userId: client.data.user.id,
      message: payload.text,
      timestamp: Date.now(),
    })
  }

  @OnMessage('chat:join')
  handleJoinRoom(params: WsMessageParams<{ roomId: string }>) {
    const { client, payload } = params
    client.join(`room:${payload.roomId}`)
    client.emit('chat:joined', { roomId: payload.roomId })
  }

  @OnMessage('chat:leave')
  handleLeaveRoom(params: WsMessageParams<{ roomId: string }>) {
    const { client, payload } = params
    client.leave(`room:${payload.roomId}`)
  }

  @OnMessage('chat:typing')
  handleTyping(params: WsMessageParams<{ roomId: string }>) {
    const { client, payload } = params
    // Broadcast to others in room
    client.to(`room:${payload.roomId}`).emit('chat:typing', {
      userId: client.data.user.id,
    })
  }
}
```

### Guards

```typescript
import { Injectable, inject } from '@navios/di'
import { WsGuard, WsExecutionContext, UseWsGuards } from '@navios/ws'

@Injectable()
class WsAuthGuard implements WsGuard {
  private authService = inject(AuthService)

  async canActivate(context: WsExecutionContext): Promise<boolean> {
    const client = context.getClient()
    const token = client.handshake.auth?.token

    if (!token) {
      return false
    }

    try {
      const user = await this.authService.validateToken(token)
      client.data.user = user
      return true
    } catch {
      return false
    }
  }
}

@WebSocketGateway({ path: '/ws' })
@UseWsGuards(WsAuthGuard)
@Injectable()
class ProtectedGateway {
  // All handlers require authentication
}
```

### Broadcasting from Services

```typescript
import { Injectable, inject } from '@navios/di'
import { WsService } from '@navios/ws'

@Injectable()
class NotificationService {
  private ws = inject(WsService)

  async notifyUser(userId: string, notification: Notification) {
    // Send to specific user's room
    this.ws.to(`user:${userId}`).emit('notification', notification)
  }

  async broadcastAnnouncement(message: string) {
    // Broadcast to all connected clients
    this.ws.emit('announcement', { message })
  }

  async notifyRoom(roomId: string, event: string, data: unknown) {
    this.ws.to(`room:${roomId}`).emit(event, data)
  }
}
```

### Typed Messages with Builder

```typescript
import { wsBuilder } from '@navios/ws'
import { z } from 'zod'

const WS = wsBuilder()

// Define typed WebSocket events
export const chatMessage = WS.declareWsEvent({
  event: 'chat:message',
  payloadSchema: z.object({
    roomId: z.string(),
    text: z.string().max(1000),
  }),
  responseSchema: z.object({
    userId: z.string(),
    message: z.string(),
    timestamp: z.number(),
  }),
})

export const chatTyping = WS.declareWsEvent({
  event: 'chat:typing',
  payloadSchema: z.object({
    roomId: z.string(),
  }),
})

// Use in gateway
@WebSocketGateway()
@Injectable()
class ChatGateway {
  private server = inject(WsServer)

  @OnMessage(chatMessage)
  handleMessage(
    params: WsMessageParams<typeof chatMessage>
  ): z.infer<typeof chatMessage.responseSchema> {
    const { client, payload } = params
    return {
      userId: client.data.user.id,
      message: payload.text,
      timestamp: Date.now(),
    }
  }
}
```

---

## Architecture Considerations

### Adapter Pattern

Support multiple WebSocket implementations:

```typescript
import { provideWsService, FastifyWsAdapter, BunWsAdapter } from '@navios/ws'

// Fastify adapter (ws library)
const WsToken = provideWsService({
  adapter: new FastifyWsAdapter(),
})

// Bun adapter (native WebSocket)
const WsToken = provideWsService({
  adapter: new BunWsAdapter(),
})
```

### Redis Adapter for Scaling

```typescript
import { provideWsService, RedisWsAdapter } from '@navios/ws'

const WsToken = provideWsService({
  adapter: new RedisWsAdapter({
    host: 'localhost',
    port: 6379,
  }),
})
```

This enables:
- Horizontal scaling across multiple server instances
- Rooms and broadcasting work across all instances
- Pub/sub for message distribution

### Connection State

```typescript
interface WsClient {
  id: string
  handshake: {
    headers: Record<string, string>
    auth: Record<string, unknown>
    query: Record<string, string>
    url: string
  }
  data: Record<string, unknown> // Custom data storage
  rooms: Set<string>

  emit(event: string, data: unknown): void
  join(room: string): void
  leave(room: string): void
  to(room: string): WsBroadcaster
  disconnect(close?: boolean): void
}
```

---

## Integration with Streams

Relationship with existing `@Stream()` decorator:

- `@Stream()` - Server-sent events (SSE), one-way server -> client
- `@navios/ws` - Full duplex WebSocket communication

```typescript
// SSE for simple server push
@Stream(notificationsStream)
async *notifications(params: StreamParams<typeof notificationsStream>) {
  for await (const notification of this.notificationService.subscribe()) {
    yield notification
  }
}

// WebSocket for bidirectional
@WebSocketGateway()
@Injectable()
class NotificationGateway {
  @OnMessage('subscribe')
  handleSubscribe(params: WsMessageParams<SubscribePayload>) {
    // Client can also send messages back
    params.client.join(`notifications:${params.payload.channel}`)
  }
}
```

---

## Open Questions

1. **Protocol**: Use Socket.IO protocol for compatibility, or custom/raw WebSocket?
2. **Namespaces**: Full namespace support or simplified rooms-only?
3. **Binary**: Binary message support and protocol?
4. **Acknowledgments**: Request-response pattern with acks?
5. **Rate limiting**: Built-in throttling for WebSocket messages?
6. **Reconnection**: Server-side reconnection handling?

---

## Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `ws` | ^8.x | WebSocket server (Fastify) |
| `ioredis` | ^5.x | Optional: Redis adapter |

---

## Related Packages

- `@navios/core` - `@Stream()` for SSE
- `@navios/events` - Internal event system
- `@navios/throttle` - Rate limiting

---

## Implementation Priority

- [ ] Basic gateway setup with `provideWsService()`
- [ ] Connection handling with `@OnConnection`, `@OnDisconnection`
- [ ] Message handlers with `@OnMessage`
- [ ] Rooms (join/leave/broadcast)
- [ ] Guards and authentication
- [ ] Fastify adapter
- [ ] Bun adapter
- [ ] Typed messages with builder
- [ ] Redis adapter for scaling
- [ ] Heartbeat/ping-pong
- [ ] Binary message support
- [ ] Namespaces
