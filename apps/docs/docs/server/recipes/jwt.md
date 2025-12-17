---
sidebar_position: 1
title: JWT Authentication
---

# JWT Authentication

Type-safe JWT (JSON Web Token) authentication library for the Navios framework. Provides token signing, verification, and decoding with seamless integration into Navios's dependency injection system.

**Package:** `@navios/jwt`
**License:** MIT
**Dependencies:** `jsonwebtoken` (^9.0.3)

## Installation

```bash
npm install @navios/jwt
```

## Quick Start

```typescript
import { provideJwtService } from '@navios/jwt'

const JwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h',
  },
})
```

## Usage

### Signing Tokens

```typescript
import { Injectable, inject } from '@navios/di'
import { JwtService } from '@navios/jwt'

@Injectable()
class AuthService {
  private jwtService = inject(JwtService)

  async createToken(userId: string) {
    return this.jwtService.signAsync({ sub: userId, role: 'admin' })
  }
}
```

### Verifying Tokens

```typescript
try {
  const payload = await jwtService.verifyAsync<{ sub: string }>(token)
  console.log(payload.sub)
} catch (error) {
  if (error instanceof TokenExpiredError) {
    console.error('Token has expired')
  }
}
```

### Decoding Without Verification

```typescript
// Warning: This does NOT verify the signature
const payload = jwtService.decode<{ sub: string }>(token)
```

## Configuration Options

### Basic Configuration

```typescript
const JwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h',
    algorithm: 'HS256',
  },
})
```

### Async Configuration

```typescript
const JwtService = provideJwtService(async () => {
  const config = await inject(ConfigService)
  return {
    secret: config.jwt.secret,
    signOptions: { expiresIn: config.jwt.expiresIn },
  }
})
```

### Asymmetric Keys (RS256)

```typescript
const JwtService = provideJwtService({
  privateKey: fs.readFileSync('private.pem'),
  publicKey: fs.readFileSync('public.pem'),
  signOptions: { algorithm: 'RS256' },
})
```

## Auth Guard Example

```typescript
@Injectable()
class JwtAuthGuard implements CanActivate {
  private jwtService = inject(JwtService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const auth = request.headers.authorization

    if (!auth?.startsWith('Bearer ')) return false

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

## Error Handling

```typescript
import { TokenExpiredError, NotBeforeError, JsonWebTokenError } from '@navios/jwt'

try {
  const payload = await jwtService.verifyAsync(token)
} catch (error) {
  if (error instanceof TokenExpiredError) {
    // Token has expired
  } else if (error instanceof NotBeforeError) {
    // Token not yet valid
  } else if (error instanceof JsonWebTokenError) {
    // Invalid token
  }
}
```

## Supported Algorithms

| Type | Algorithms |
|------|------------|
| HMAC | HS256, HS384, HS512 |
| RSA | RS256, RS384, RS512 |
| ECDSA | ES256, ES384, ES512 |
| RSA-PSS | PS256, PS384, PS512 |
