# Navios JWT

## Overview

Navios JWT is a TypeScript library that provides a robust implementation for JSON Web Token (JWT) for a Navios framework operations in your applications. It wraps the functionality of the `jsonwebtoken` library with a service-oriented approach that integrates with the Navios dependency injection system.

It was forked from a [NestJS](https://github.com/nestjs/jwt) library and is designed to be used with the Navios framework, providing a seamless experience for signing and verifying JWTs.

## Installation

```bash
npm install @navios/jwt
# or
yarn add @navios/jwt
```

## Features

- Token signing with customizable options
- Token verification with comprehensive validation
- Support for various JWT algorithms (HS256, RS256, ES256, etc.)
- Integration with Navios dependency injection system
- Type-safe API with Zod schema validation

## Usage

### Basic Setup

```typescript
import { inject } from '@navios/core';
import { provideJwtService } from '@navios/jwt';


const MyJwtService = provideJwtService({
  secret: 'your-secret-key',
  signOptions: {
    expiresIn: '1h'
  },
})
// Or with factory
const JwtService = provideJwtService(async () => {
  const config = await inject(ConfigService);
  return config.jwt
})
```

### Signing Tokens

```typescript
// Create a token
import { Injectable, syncInject } from '@navios/core'
import { JwtService } from '../service/jwt.service.mjs'
//or to load without options
import { JwtService } from '@navios/jwt'

@Injectable()
class AuthService {
  jwtService = syncInject(JwtService)
  
  async generateToken(userId: number, role: string) {
    const token = await this.jwtService.signAsync({ userId, role });
    return token;
  }
}

```

### Verifying Tokens

```typescript
try {
  // Verify and decode a token
  const payload = await jwtService.verify(token);
  console.log(payload); // { userId: 123, role: 'admin', iat: 1234567890, exp: 1234571490 }
} catch (error) {
  // Handle verification errors
  if (error instanceof TokenExpiredError) {
    console.error('Token expired');
  } else if (error instanceof JsonWebTokenError) {
    console.error('Invalid token');
  }
}
```

## API Reference

### JwtServiceOptions

Configuration options for the JWT service:

```typescript
interface JwtServiceOptions {
  signOptions?: SignOptions;
  secret?: string;
  publicKey?: string | Buffer;
  privateKey?: Secret;
  verifyOptions?: VerifyOptions;
  secretOrKeyProvider?: (
    requestType: RequestType,
    token?: string,
    options?: SignOptions | VerifyOptions
  ) => Secret | Promise<Secret>;
}
```

### Error Handling

The library exports error classes from the underlying `jsonwebtoken` library:
- `TokenExpiredError`: Thrown when the token is expired
- `NotBeforeError`: Thrown when the token is not yet valid
- `JsonWebTokenError`: Base class for all JWT errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE)
