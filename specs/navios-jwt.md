# @navios/jwt Specification

## Overview

`@navios/jwt` is a type-safe JWT (JSON Web Token) authentication library for the Navios framework. It provides token signing, verification, and decoding with seamless integration into Navios's dependency injection system.

**Package:** `@navios/jwt`
**Version:** 0.5.0
**License:** MIT
**Dependencies:** `jsonwebtoken` (^9.0.3)
**Peer Dependencies:** `@navios/core`, `zod` (^3.25.0 || ^4.0.0)

---

## Core Concepts

### Architecture Overview

```
JwtService
├── sign() / signAsync() - Create tokens
├── verify() / verifyAsync() - Validate tokens
└── decode() - Decode without validation

Configuration
├── Static config via provideJwtService({ ... })
└── Async config via provideJwtService(async () => { ... })
```

### Key Principles

- **Type-Safe** - Full TypeScript support with Zod validation
- **DI Integration** - Injectable service via @navios/di
- **Flexible Configuration** - Static or async configuration
- **Algorithm Support** - All standard JWT algorithms (HS256, RS256, ES256, etc.)

---

## Setup

### Basic Configuration

```typescript
import { provideJwtService } from '@navios/jwt'

const JwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h',
  },
})
```

### Async Configuration

```typescript
import { provideJwtService } from '@navios/jwt'
import { inject } from '@navios/di'

const JwtService = provideJwtService(async () => {
  const configService = await inject(ConfigService)
  return {
    secret: configService.jwt.secret,
    signOptions: {
      expiresIn: configService.jwt.expiresIn,
    },
  }
})
```

### Asymmetric Keys (RS256)

```typescript
import { provideJwtService } from '@navios/jwt'
import fs from 'fs'

const JwtService = provideJwtService({
  privateKey: fs.readFileSync('private.pem'),
  publicKey: fs.readFileSync('public.pem'),
  signOptions: {
    algorithm: 'RS256',
    expiresIn: '1h',
  },
})
```

---

## JwtService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { JwtService } from '@navios/jwt'

@Injectable()
class AuthService {
  private jwtService = inject(JwtService)

  async createToken(userId: string) {
    return this.jwtService.signAsync({ sub: userId })
  }
}
```

### sign(payload, options?)

Synchronously signs a JWT token.

```typescript
const token = jwtService.sign({ sub: userId, role: 'admin' })

// With options override
const token = jwtService.sign(
  { sub: userId },
  { expiresIn: '7d' }
)
```

**Parameters:**

| Parameter | Type                            | Description           |
| --------- | ------------------------------- | --------------------- |
| `payload` | `string \| Buffer \| object`    | Token payload         |
| `options` | `JwtSignOptions`                | Optional sign options |

**Returns:** `string` - The signed JWT token

**Note:** Throws if using async `secretOrKeyProvider`.

### signAsync(payload, options?)

Asynchronously signs a JWT token.

```typescript
const token = await jwtService.signAsync({ sub: userId, role: 'admin' })

// With options override
const token = await jwtService.signAsync(
  { sub: userId },
  { expiresIn: '7d', secret: 'different-secret' }
)
```

**Parameters:**

| Parameter | Type                            | Description           |
| --------- | ------------------------------- | --------------------- |
| `payload` | `string \| Buffer \| object`    | Token payload         |
| `options` | `JwtSignOptions`                | Optional sign options |

**Returns:** `Promise<string>` - The signed JWT token

### verify(token, options?)

Synchronously verifies and decodes a JWT token.

```typescript
try {
  const payload = jwtService.verify<{ sub: string; role: string }>(token)
  console.log(payload.sub, payload.role)
} catch (error) {
  if (error instanceof TokenExpiredError) {
    console.error('Token has expired')
  } else if (error instanceof JsonWebTokenError) {
    console.error('Invalid token')
  }
}
```

**Parameters:**

| Parameter | Type               | Description             |
| --------- | ------------------ | ----------------------- |
| `token`   | `string`           | JWT token to verify     |
| `options` | `JwtVerifyOptions` | Optional verify options |

**Returns:** `T` - Decoded payload

**Throws:**
- `TokenExpiredError` - Token has expired
- `NotBeforeError` - Token not yet valid
- `JsonWebTokenError` - Invalid token

### verifyAsync(token, options?)

Asynchronously verifies and decodes a JWT token.

```typescript
try {
  const payload = await jwtService.verifyAsync<{ sub: string }>(token)
  console.log(payload.sub)
} catch (error) {
  // Handle errors
}
```

**Parameters:**

| Parameter | Type               | Description             |
| --------- | ------------------ | ----------------------- |
| `token`   | `string`           | JWT token to verify     |
| `options` | `JwtVerifyOptions` | Optional verify options |

**Returns:** `Promise<T>` - Decoded payload

### decode(token, options?)

Decodes a JWT token without verification.

```typescript
// Decode without verifying signature
const payload = jwtService.decode<{ sub: string }>(token)

// Get complete token (header + payload + signature)
const complete = jwtService.decode(token, { complete: true })
console.log(complete.header.alg)
```

**Parameters:**

| Parameter | Type            | Description              |
| --------- | --------------- | ------------------------ |
| `token`   | `string`        | JWT token to decode      |
| `options` | `DecodeOptions` | Optional decode options  |

**Returns:** `T` - Decoded payload (or complete token if `complete: true`)

**Warning:** This does NOT verify the token signature. Use `verify()` for validation.

---

## Configuration Options

### JwtServiceOptions

```typescript
interface JwtServiceOptions {
  secret?: string
  publicKey?: string | Buffer
  privateKey?: Secret
  signOptions?: SignOptions
  verifyOptions?: VerifyOptions
  secretOrKeyProvider?: (
    requestType: RequestType,
    token?: string,
    options?: SignOptions | VerifyOptions
  ) => Secret | Promise<Secret>
}
```

### SignOptions

```typescript
interface SignOptions {
  algorithm?: Algorithm        // Default: 'HS256'
  expiresIn?: string | number  // e.g., '1h', '7d', 3600
  notBefore?: string | number  // e.g., '10m'
  audience?: string | string[]
  subject?: string
  issuer?: string
  jwtid?: string
  keyid?: string
  noTimestamp?: boolean
  header?: JwtHeader
  encoding?: string
  mutatePayload?: boolean
}
```

### VerifyOptions

```typescript
interface VerifyOptions {
  algorithms?: Algorithm[]
  audience?: string | string[]
  issuer?: string | string[]
  subject?: string
  jwtid?: string
  clockTimestamp?: number
  clockTolerance?: number
  maxAge?: string | number
  complete?: boolean
  ignoreExpiration?: boolean
  ignoreNotBefore?: boolean
  nonce?: string
}
```

### Supported Algorithms

| Type  | Algorithms              |
| ----- | ----------------------- |
| HMAC  | HS256, HS384, HS512     |
| RSA   | RS256, RS384, RS512     |
| ECDSA | ES256, ES384, ES512     |
| RSA-PSS | PS256, PS384, PS512   |
| None  | none (unsigned)         |

---

## Error Handling

### Error Types

```typescript
import {
  TokenExpiredError,
  NotBeforeError,
  JsonWebTokenError,
} from '@navios/jwt'

try {
  const payload = await jwtService.verifyAsync(token)
} catch (error) {
  if (error instanceof TokenExpiredError) {
    // Token has expired
    console.log('Expired at:', error.expiredAt)
  } else if (error instanceof NotBeforeError) {
    // Token not yet valid
    console.log('Valid after:', error.date)
  } else if (error instanceof JsonWebTokenError) {
    // Invalid token (malformed, bad signature, etc.)
    console.log('Error:', error.message)
  }
}
```

---

## Integration with Guards

### JWT Authentication Guard

```typescript
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext } from '@navios/core'
import { JwtService, TokenExpiredError } from '@navios/jwt'

@Injectable()
class JwtAuthGuard implements CanActivate {
  private jwtService = inject(JwtService)
  private userService = inject(UserService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const token = this.extractTokenFromHeader(request.headers)

    if (!token) {
      return false
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token)
      const user = await this.userService.findById(payload.sub)

      if (!user || !user.isActive) {
        return false
      }

      // Attach user to request for use in handlers
      request.user = user
      return true
    } catch (error) {
      return false
    }
  }

  private extractTokenFromHeader(headers: Record<string, string>): string | null {
    const authorization = headers.authorization
    if (!authorization) return null

    const [type, token] = authorization.split(' ')
    return type === 'Bearer' ? token : null
  }
}
```

### Using the Guard

```typescript
import { Module, Controller, Endpoint } from '@navios/core'

@Module({
  guards: [JwtAuthGuard],
  controllers: [ProtectedController],
})
class ProtectedModule {}

// Or at controller level
@Controller({ guards: [JwtAuthGuard] })
class ProtectedController {
  @Endpoint(getProfile)
  async getProfile(params: EndpointParams<typeof getProfile>) {
    // request.user is available from guard
    return params.request.user
  }
}
```

---

## Advanced Features

### Dynamic Secret Provider

Use `secretOrKeyProvider` for dynamic key management:

```typescript
import { provideJwtService, RequestType } from '@navios/jwt'

const JwtService = provideJwtService({
  secretOrKeyProvider: async (requestType, token, options) => {
    if (requestType === RequestType.Sign) {
      // Return signing key
      return await getSigningKey()
    } else {
      // Return verification key (can be different for key rotation)
      const decoded = jwtService.decode(token, { complete: true })
      return await getKeyById(decoded.header.kid)
    }
  },
})
```

**Use Cases:**
- Key rotation
- Per-tenant secrets in multi-tenant apps
- Fetching keys from external key management services
- Algorithm-specific key selection

### Token Refresh Pattern

```typescript
@Injectable()
class AuthService {
  private jwtService = inject(JwtService)

  async createTokenPair(userId: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, type: 'access' },
      { expiresIn: '15m' }
    )

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, type: 'refresh' },
      { expiresIn: '7d' }
    )

    return { accessToken, refreshToken }
  }

  async refreshTokens(refreshToken: string) {
    const payload = await this.jwtService.verifyAsync<{
      sub: string
      type: string
    }>(refreshToken)

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type')
    }

    return this.createTokenPair(payload.sub)
  }
}
```

---

## Complete Example

```typescript
// config/jwt.config.ts
import { provideJwtService } from '@navios/jwt'

export const JwtService = provideJwtService({
  secret: process.env.JWT_SECRET!,
  signOptions: {
    expiresIn: '1h',
    issuer: 'my-app',
  },
  verifyOptions: {
    issuer: 'my-app',
  },
})
```

```typescript
// services/auth.service.ts
import { Injectable, inject } from '@navios/di'
import { JwtService, TokenExpiredError } from '@navios/jwt'

interface TokenPayload {
  sub: string
  email: string
  role: string
}

@Injectable()
class AuthService {
  private jwtService = inject(JwtService)
  private userService = inject(UserService)

  async login(email: string, password: string) {
    const user = await this.userService.validateCredentials(email, password)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    return { token, user }
  }

  async validateToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync<TokenPayload>(token)
  }
}
```

```typescript
// guards/jwt-auth.guard.ts
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext } from '@navios/core'
import { JwtService } from '@navios/jwt'

@Injectable()
class JwtAuthGuard implements CanActivate {
  private jwtService = inject(JwtService)
  private userService = inject(UserService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const auth = request.headers.authorization

    if (!auth?.startsWith('Bearer ')) {
      return false
    }

    try {
      const token = auth.slice(7)
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token)
      request.user = await this.userService.findById(payload.sub)
      return !!request.user
    } catch {
      return false
    }
  }
}
```

```typescript
// modules/auth.module.ts
import { Module, Controller, Endpoint } from '@navios/core'

@Controller()
class AuthController {
  private authService = inject(AuthService)

  @Endpoint(loginEndpoint)
  async login(params: EndpointParams<typeof loginEndpoint>) {
    return this.authService.login(params.data.email, params.data.password)
  }
}

@Module({
  controllers: [AuthController],
})
class AuthModule {}

@Module({
  guards: [JwtAuthGuard],
  controllers: [ProtectedController],
})
class ProtectedModule {}
```

---

## API Reference Summary

### Exports

| Export              | Type          | Description                        |
| ------------------- | ------------- | ---------------------------------- |
| `JwtService`        | Class         | Main JWT service                   |
| `JwtServiceToken`   | InjectionToken| DI token for JwtService            |
| `provideJwtService` | Function      | Factory for configuring JwtService |
| `TokenExpiredError` | Error Class   | Token expiration error             |
| `NotBeforeError`    | Error Class   | Token not-yet-valid error          |
| `JsonWebTokenError` | Error Class   | Base JWT error class               |
| `RequestType`       | Enum          | Sign or Verify request type        |

### JwtService Methods

| Method        | Return            | Description                    |
| ------------- | ----------------- | ------------------------------ |
| `sign`        | `string`          | Synchronously sign a token     |
| `signAsync`   | `Promise<string>` | Asynchronously sign a token    |
| `verify`      | `T`               | Synchronously verify a token   |
| `verifyAsync` | `Promise<T>`      | Asynchronously verify a token  |
| `decode`      | `T`               | Decode without verification    |
