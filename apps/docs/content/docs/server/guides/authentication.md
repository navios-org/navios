---
sidebar_position: 3
title: Authentication
---

# Authentication

Implement authentication and authorization in your Navios application using guards and various authentication strategies.

## Overview

Authentication in Navios is built on the guard system. Guards run before endpoint handlers and can verify credentials, validate tokens, and attach user information to requests. This guide covers the general patterns for implementing authentication, regardless of the specific strategy you choose.

## Authentication Flow

The typical authentication flow in Navios:

1. **Client sends credentials** → Login endpoint receives credentials
2. **Service validates credentials** → Auth service verifies against your data source
3. **Service issues token/session** → Returns authentication token or session identifier
4. **Client includes token** → Subsequent requests include token in headers
5. **Guard validates token** → Auth guard verifies token and loads user
6. **Request proceeds** → User information available in endpoint handlers

## Core Concepts

### Auth Service

The auth service handles credential validation and token/session management:

```typescript
@Injectable()
class AuthService {
  async validateCredentials(identifier: string, secret: string) {
    // Validate against database, LDAP, OAuth provider, etc.
    // Return user if valid, null/throw if invalid
  }

  async createSession(user: User) {
    // Generate token, create session, etc.
    // Return session identifier or token
  }

  async validateSession(sessionId: string) {
    // Verify token, lookup session, etc.
    // Return user or null
  }
}
```

### Auth Guard

The auth guard protects endpoints by validating authentication:

```typescript
@Injectable()
class AuthGuard implements CanActivate {
  private authService = inject(AuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()

    // Extract credentials from request
    const credentials = this.extractCredentials(request)

    if (!credentials) {
      throw new UnauthorizedException('Missing credentials')
    }

    // Validate credentials
    const user = await this.authService.validateSession(credentials)

    if (!user) {
      throw new UnauthorizedException('Invalid or expired session')
    }

    // Attach user to request
    request.user = user
    return true
  }

  private extractCredentials(request: Request): string | null {
    // Extract from Authorization header, cookies, etc.
    const auth = request.headers.authorization
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null
  }
}
```

## Authentication Strategies

### JWT (JSON Web Tokens)

JWT is a stateless token-based authentication strategy. Tokens are self-contained and include user information.

**Use JWT when:**

- You need stateless authentication
- You want to scale horizontally
- Token expiration is sufficient for security

**Implementation:**

- Use `@navios/jwt` package for token signing/verification
- Store user ID in token payload
- Validate token signature in guard
- Optionally verify user still exists in database

See the [JWT Authentication recipe](/docs/server/recipes/authentication) for a complete implementation.

### OAuth 2.0 / OpenID Connect

OAuth 2.0 allows users to authenticate with external providers (Google, GitHub, etc.).

**Use OAuth when:**

- You want to delegate authentication to a provider
- Users already have accounts with providers
- You need to access provider APIs on behalf of users

**Implementation pattern:**

```typescript
@Injectable()
class OAuthService {
  async handleCallback(code: string, state: string) {
    // Exchange authorization code for access token
    const tokens = await this.exchangeCode(code)

    // Fetch user info from provider
    const providerUser = await this.getUserInfo(tokens.accessToken)

    // Find or create user in your system
    const user = await this.findOrCreateUser(providerUser)

    // Create session for your application
    return this.createSession(user)
  }
}

@Injectable()
class OAuthGuard implements CanActivate {
  private oauthService = inject(OAuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const sessionId = this.extractSessionId(request)

    if (!sessionId) {
      // Redirect to OAuth provider
      throw new RedirectException(this.oauthService.getAuthUrl())
    }

    const user = await this.oauthService.validateSession(sessionId)
    if (!user) {
      throw new UnauthorizedException()
    }

    request.user = user
    return true
  }
}
```

### Passport.js Integration

Passport.js provides a middleware-based authentication framework with 500+ strategies.

**Use Passport when:**

- You need a specific strategy Passport supports
- You want to leverage existing Passport middleware
- You're migrating from Express/NestJS

**Implementation pattern:**

```typescript
import passport from 'passport'
import { Strategy as JwtStrategy } from 'passport-jwt'
import { Strategy as LocalStrategy } from 'passport-local'

@Injectable()
class PassportAuthService {
  configureStrategies() {
    // Configure Local Strategy
    passport.use(
      new LocalStrategy(
        { usernameField: 'email', passwordField: 'password' },
        async (email, password, done) => {
          const user = await this.validateCredentials(email, password)
          return done(null, user || false)
        },
      ),
    )

    // Configure JWT Strategy
    passport.use(
      new JwtStrategy(
        {
          jwtFromRequest: (req) => {
            const auth = req.headers.authorization
            return auth?.startsWith('Bearer ') ? auth.slice(7) : null
          },
          secretOrKey: process.env.JWT_SECRET,
        },
        async (payload, done) => {
          const user = await this.findUserById(payload.sub)
          return done(null, user || false)
        },
      ),
    )
  }
}

@Injectable()
class PassportAuthGuard implements CanActivate {
  private authService = inject(PassportAuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()

    return new Promise((resolve, reject) => {
      passport.authenticate('jwt', { session: false }, (err, user) => {
        if (err || !user) {
          reject(new UnauthorizedException())
          return
        }
        request.user = user
        resolve(true)
      })(request, null, () => {})
    })
  }
}
```

### Session-Based Authentication

Session-based authentication stores session data server-side (in memory, Redis, database).

**Use sessions when:**

- You need to revoke sessions immediately
- You want to store additional session data
- You prefer server-side session management

**Implementation pattern:**

```typescript
@Injectable()
class SessionService {
  private sessions = new Map<string, Session>() // Use Redis/DB in production

  async createSession(user: User): Promise<string> {
    const sessionId = crypto.randomUUID()
    this.sessions.set(sessionId, {
      userId: user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })
    return sessionId
  }

  async validateSession(sessionId: string): Promise<User | null> {
    const session = this.sessions.get(sessionId)
    if (!session || session.expiresAt < new Date()) {
      return null
    }
    return this.findUserById(session.userId)
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }
}

@Injectable()
class SessionAuthGuard implements CanActivate {
  private sessionService = inject(SessionService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const sessionId = request.cookies?.sessionId

    if (!sessionId) {
      throw new UnauthorizedException('No session')
    }

    const user = await this.sessionService.validateSession(sessionId)
    if (!user) {
      throw new UnauthorizedException('Invalid session')
    }

    request.user = user
    return true
  }
}
```

### API Key Authentication

API keys are simple tokens used for service-to-service authentication.

**Use API keys when:**

- Authenticating services or bots
- You need simple, long-lived credentials
- Rate limiting per key is sufficient

**Implementation:**

```typescript
@Injectable()
class ApiKeyService {
  async validateApiKey(key: string): Promise<ApiKey | null> {
    // Lookup key in database
    const apiKey = await this.db.apiKeys.findUnique({ where: { key } })

    if (!apiKey || apiKey.revoked || apiKey.expiresAt < new Date()) {
      return null
    }

    return apiKey
  }
}

@Injectable()
class ApiKeyGuard implements CanActivate {
  private apiKeyService = inject(ApiKeyService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const apiKey = request.headers['x-api-key']

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key')
    }

    const key = await this.apiKeyService.validateApiKey(apiKey)
    if (!key) {
      throw new UnauthorizedException('Invalid API key')
    }

    // Attach API key info to request
    request.apiKey = key
    return true
  }
}
```

## Login Endpoints

Create login endpoints that validate credentials and issue sessions:

```typescript
const loginEndpoint = API.declareEndpoint({
  method: 'POST',
  url: '/auth/login',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  responseSchema: z.object({
    token: z.string(), // or sessionId
    user: z.object({
      id: z.string(),
      email: z.string(),
    }),
  }),
})

@Controller()
class AuthController {
  private authService = inject(AuthService)

  @Endpoint(loginEndpoint)
  async login(params: EndpointParams<typeof loginEndpoint>) {
    const user = await this.authService.validateCredentials(
      params.data.email,
      params.data.password,
    )

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const token = await this.authService.createSession(user)

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    }
  }
}
```

## Protecting Endpoints

### Endpoint-Level Protection

```typescript
@Controller()
class UserController {
  @Endpoint(getProfile)
  @UseGuards(AuthGuard)
  async getProfile(params: EndpointParams<typeof getProfile>) {
    const request = inject(Request)
    return request.user // User attached by guard
  }
}
```

### Module-Level Protection

```typescript
@Module({
  controllers: [UserController, ProfileController],
  guards: [AuthGuard], // All endpoints require authentication
})
class UserModule {}
```

### Conditional Protection

```typescript
@Controller()
class PublicController {
  @Endpoint(publicEndpoint)
  // No guard - public access
  async publicEndpoint() {}

  @Endpoint(protectedEndpoint)
  @UseGuards(AuthGuard)
  async protectedEndpoint() {}
}
```

## Role-Based Access Control

Implement role-based access control with a roles guard:

```typescript
@Injectable()
class RolesGuard implements CanActivate {
  constructor(private allowedRoles: string[]) {}

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('Not authenticated')
    }

    if (!this.allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}

// Helper function
function RequireRoles(...roles: string[]) {
  return new RolesGuard(roles)
}

// Usage
@Endpoint(adminAction)
@UseGuards(AuthGuard, RequireRoles('admin', 'superadmin'))
async adminAction() {}
```

## Security Best Practices

### Password Handling

- **Never store plaintext passwords** - Always hash with bcrypt, argon2, or similar
- **Use appropriate cost factors** - bcrypt cost 10-12, argon2 time cost 3+
- **Validate password strength** - Minimum length, complexity requirements
- **Use constant-time comparison** - Prevent timing attacks

```typescript
import * as bcrypt from 'bcrypt'

async hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

### Token Security

- **Use short expiration times** - Access tokens: 15-60 minutes
- **Implement refresh tokens** - Longer-lived tokens for refreshing access
- **Store secrets securely** - Environment variables, secrets manager
- **Use HTTPS in production** - Prevent token interception
- **Implement token revocation** - Blacklist or database lookup

### Session Security

- **Use secure cookies** - `httpOnly`, `secure`, `sameSite`
- **Implement CSRF protection** - CSRF tokens for state-changing operations
- **Set appropriate expiration** - Balance security and user experience
- **Implement session rotation** - Regenerate session ID on privilege changes

### General Security

- **Rate limit auth endpoints** - Prevent brute force attacks
- **Log authentication attempts** - Monitor for suspicious activity
- **Validate all input** - Use Zod schemas for all endpoints
- **Use parameterized queries** - Prevent SQL injection
- **Implement account lockout** - After N failed attempts

## Common Patterns

### Refresh Token Pattern

```typescript
@Injectable()
class AuthService {
  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password)

    return {
      accessToken: await this.createAccessToken(user), // Short-lived
      refreshToken: await this.createRefreshToken(user), // Long-lived
    }
  }

  async refresh(refreshToken: string) {
    const user = await this.validateRefreshToken(refreshToken)
    return {
      accessToken: await this.createAccessToken(user),
      refreshToken: await this.createRefreshToken(user), // Rotate
    }
  }
}
```

### Multi-Factor Authentication

```typescript
@Injectable()
class MfaService {
  async initiateMfa(userId: string) {
    // Generate and send code
    const code = this.generateCode()
    await this.sendCode(userId, code)
    return { mfaRequired: true }
  }

  async verifyMfa(userId: string, code: string) {
    const valid = await this.validateCode(userId, code)
    if (!valid) {
      throw new UnauthorizedException('Invalid MFA code')
    }
    return this.createSession(userId)
  }
}
```

## Related

- [Guards](/docs/server/guides/guards) - Guard system overview
- [JWT Authentication Recipe](/docs/server/recipes/authentication) - Complete JWT implementation with package reference
- [Error Handling](/docs/server/guides/error-handling) - Handling auth errors
- [Configuration](/docs/server/guides/configuration) - Managing secrets
