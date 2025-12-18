---
sidebar_position: 1
---

# @navios/jwt

Type-safe JWT signing and verification for Navios applications. Provides a service-oriented approach that integrates seamlessly with the Navios dependency injection system.

## Features

- **Token Signing**: Create JWTs with customizable options
- **Token Verification**: Comprehensive validation with support for all standard JWT claims
- **Multiple Algorithms**: Support for symmetric (HS256, HS384, HS512) and asymmetric (RS256, ES256, PS256, etc.) algorithms
- **Dependency Injection**: Seamless integration with Navios DI system
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Async Support**: Both synchronous and asynchronous APIs
- **Dynamic Key Providers**: Support for dynamic secret/key resolution

## Installation

```bash
npm install @navios/jwt
# or
yarn add @navios/jwt
```

## Quick Start

### Basic Setup

```typescript
import { provideJwtService } from '@navios/jwt'

// Static configuration
const JwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h',
    algorithm: 'HS256',
  },
  verifyOptions: {
    algorithms: ['HS256'],
  },
})
```

### Using with Dependency Injection

```typescript
import { Injectable, inject } from '@navios/core'
import { JwtService } from '@navios/jwt'

@Injectable()
class AuthService {
  jwtService = inject(JwtService)

  async login(userId: string, role: string) {
    // Sign a token
    const token = this.jwtService.sign(
      { userId, role },
      { expiresIn: '1h' }
    )
    return { token }
  }

  async validateToken(token: string) {
    try {
      // Verify and decode the token
      const payload = this.jwtService.verify<{ userId: string; role: string }>(token)
      return payload
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new Error('Token expired')
      }
      throw error
    }
  }
}
```

## Configuration

### Static Configuration

```typescript
import { provideJwtService } from '@navios/jwt'

const JwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h',
    algorithm: 'HS256',
  },
  verifyOptions: {
    algorithms: ['HS256'],
  },
})
```

### Async Configuration

When you need to load configuration dynamically:

```typescript
import { provideJwtService } from '@navios/jwt'
import { inject } from '@navios/core'

const JwtService = provideJwtService(async () => {
  const configService = await inject(ConfigService)
  return {
    secret: configService.jwt.secret,
    signOptions: {
      expiresIn: configService.jwt.expiresIn,
      algorithm: configService.jwt.algorithm,
    },
  }
})
```

### Asymmetric Keys (RS256)

For applications using RSA or ECDSA keys:

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
  verifyOptions: {
    algorithms: ['RS256'],
  },
})
```

### Dynamic Key Provider

For applications that need to resolve keys dynamically based on the token:

```typescript
import { provideJwtService, RequestType } from '@navios/jwt'

const JwtService = provideJwtService({
  secretOrKeyProvider: (requestType, token, options) => {
    if (requestType === RequestType.Sign) {
      // Return signing key
      return getSigningKey()
    } else {
      // Extract key ID from token and return corresponding public key
      const decoded = jwt.decode(token, { complete: true })
      const kid = decoded?.header?.kid
      return getPublicKeyByKid(kid)
    }
  },
})
```

## Usage

### Signing Tokens

```typescript
// Synchronous signing
const token = jwtService.sign(
  { userId: '123', role: 'admin' },
  { expiresIn: '1h' }
)

// Asynchronous signing (for async key providers)
const token = await jwtService.signAsync(
  { userId: '123', role: 'admin' },
  { expiresIn: '1h' }
)
```

### Verifying Tokens

```typescript
// Synchronous verification
try {
  const payload = jwtService.verify<{ userId: string; role: string }>(token)
  console.log(payload.userId) // '123'
} catch (error) {
  if (error instanceof TokenExpiredError) {
    console.error('Token expired')
  } else if (error instanceof JsonWebTokenError) {
    console.error('Invalid token')
  }
}

// Asynchronous verification (for async key providers)
try {
  const payload = await jwtService.verifyAsync<{ userId: string }>(token)
  console.log(payload.userId)
} catch (error) {
  // Handle errors
}
```

### Decoding Without Verification

```typescript
// Decode without verification (use with caution)
const payload = jwtService.decode<{ userId: string }>(token)
if (payload) {
  console.log(payload.userId)
}
```

## API Reference

### `JwtService`

The main service class for JWT operations.

#### Methods

- **`sign(payload, options?)`**: Signs a JWT payload synchronously
- **`signAsync(payload, options?)`**: Signs a JWT payload asynchronously
- **`verify<T>(token, options?)`**: Verifies and decodes a JWT token synchronously
- **`verifyAsync<T>(token, options?)`**: Verifies and decodes a JWT token asynchronously
- **`decode<T>(token, options?)`**: Decodes a JWT token without verification

### `provideJwtService(config)`

Creates a JWT service provider for dependency injection.

**Overloads:**
- `provideJwtService(config: JwtServiceOptions)`: Static configuration
- `provideJwtService(config: () => Promise<JwtServiceOptions>)`: Async factory configuration

### Error Classes

The library exports error classes from the underlying `jsonwebtoken` library:

- **`TokenExpiredError`**: Thrown when the token has expired
  - `expiredAt`: Date when the token expired
- **`NotBeforeError`**: Thrown when the token is not yet valid (nbf claim)
  - `date`: Date when the token becomes valid
- **`JsonWebTokenError`**: Base class for all JWT errors
  - `message`: Error message describing the issue

## Best Practices

1. **Always use `verify()` or `verifyAsync()`** for production code. Never use `decode()` for security-sensitive operations.

2. **Use async methods** when using `secretOrKeyProvider` that returns a Promise.

3. **Specify allowed algorithms** in `verifyOptions` to prevent algorithm confusion attacks:

   ```typescript
   verifyOptions: {
     algorithms: ['HS256', 'RS256'], // Explicitly allow only these algorithms
   }
   ```

4. **Set appropriate expiration times** based on your security requirements:

   ```typescript
   signOptions: {
     expiresIn: '15m', // Short-lived access tokens
   }
   ```

5. **Use asymmetric keys** for distributed systems where public keys can be shared:

   ```typescript
   // Sign with private key
   privateKey: fs.readFileSync('private.pem')
   // Verify with public key (can be shared)
   publicKey: fs.readFileSync('public.pem')
   ```

## Integration with Navios Server

See the [JWT Recipe](/docs/server/recipes/jwt) for a complete example of using JWT authentication with Navios Server.

## License

MIT

