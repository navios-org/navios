# @navios/passport Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/passport` provides integration with [Passport.js](http://www.passportjs.org/) - the most popular authentication middleware for Node.js. It brings Passport's extensive strategy ecosystem to Navios with full DI support and contract-first API definitions.

**Package:** `@navios/passport`
**Version:** 0.1.0 (planned)
**License:** MIT
**Dependencies:** `passport`
**Peer Dependencies:** `@navios/core`, `@navios/di`
**Optional Dependencies:** Various passport strategies

---

## Why Passport.js?

Passport.js is the de-facto standard for Node.js authentication with:
- **500+ strategies** - OAuth, SAML, LDAP, API keys, etc.
- **Battle-tested** - Used in production by millions of apps
- **Flexible** - Works with any database or session store
- **Extensible** - Easy to create custom strategies

This integration brings Passport's ecosystem to Navios with modern DI patterns.

---

## Key Features (Planned)

- **providePassportStrategy()** - Register strategies via DI token pattern
- **Guard integration** - Use strategies in `@UseGuards()`
- **Contract-first** - Define auth endpoints with builder
- **Multi-strategy** - Support multiple auth methods
- **Type safety** - Typed user objects and strategies

---

## Proposed API

### Strategy Configuration with providePassportStrategy

```typescript
import { InjectionToken } from '@navios/di'
import { z } from 'zod'

// Base strategy options schema
const PassportStrategyOptionsSchema = z.object({
  name: z.string(),
  strategyOptions: z.record(z.unknown()),
})

// Create a strategy provider
export function providePassportStrategy<T extends passport.Strategy>(
  name: string,
  strategyClass: new (...args: any[]) => T,
  options: StrategyOptions
): BoundInjectionToken<PassportStrategyInstance>

export function providePassportStrategy<T extends passport.Strategy>(
  name: string,
  strategyClass: new (...args: any[]) => T,
  options: () => Promise<StrategyOptions>
): FactoryInjectionToken<PassportStrategyInstance>
```

### JWT Strategy

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { inject } from '@navios/di'

export const JwtAuth = providePassportStrategy(
  'jwt',
  JwtStrategy,
  async () => {
    const config = await inject(ConfigService)
    const userService = await inject(UserService)

    return {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwt.secret,
      validate: async (payload: { sub: string }) => {
        const user = await userService.findById(payload.sub)
        if (!user) {
          throw new UnauthorizedException('User not found')
        }
        return user
      },
    }
  }
)
```

### Local Strategy (Username/Password)

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as LocalStrategy } from 'passport-local'
import { inject } from '@navios/di'

export const LocalAuth = providePassportStrategy(
  'local',
  LocalStrategy,
  async () => {
    const authService = await inject(AuthService)

    return {
      usernameField: 'email',
      passwordField: 'password',
      validate: async (email: string, password: string) => {
        const user = await authService.validateUser(email, password)
        if (!user) {
          throw new UnauthorizedException('Invalid credentials')
        }
        return user
      },
    }
  }
)
```

### OAuth Strategy (Google)

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { inject } from '@navios/di'

export const GoogleAuth = providePassportStrategy(
  'google',
  GoogleStrategy,
  async () => {
    const config = await inject(ConfigService)
    const userService = await inject(UserService)

    return {
      clientID: config.oauth.google.clientId,
      clientSecret: config.oauth.google.clientSecret,
      callbackURL: '/auth/google/callback',
      scope: ['email', 'profile'],
      validate: async (accessToken: string, refreshToken: string, profile: Profile) => {
        const { emails, displayName, photos } = profile

        let user = await userService.findByEmail(emails[0].value)

        if (!user) {
          user = await userService.create({
            email: emails[0].value,
            name: displayName,
            avatar: photos?.[0]?.value,
            provider: 'google',
            providerId: profile.id,
          })
        }

        return user
      },
    }
  }
)
```

---

## Auth Endpoints (Contract-First)

Define auth endpoints using the builder pattern.

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const api = builder()

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
})

// Login endpoint
export const loginEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/login',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  responseSchema: z.object({
    user: userSchema,
    token: z.string(),
  }),
})

// Register endpoint
export const registerEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/register',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
  }),
  responseSchema: z.object({
    user: userSchema,
    token: z.string(),
  }),
})

// Get profile endpoint
export const getProfileEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/auth/profile',
  responseSchema: userSchema,
})

// OAuth initiate endpoint
export const googleAuthEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/auth/google',
  responseSchema: z.object({
    redirectUrl: z.string(),
  }),
})

// OAuth callback endpoint
export const googleCallbackEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/auth/google/callback',
  querySchema: z.object({
    code: z.string(),
    state: z.string().optional(),
  }),
  responseSchema: z.object({
    user: userSchema,
    token: z.string(),
  }),
})
```

---

## Guards

### Creating Auth Guards

```typescript
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext, AttributeFactory } from '@navios/core'
import { PassportService } from '@navios/passport'

// Attribute to specify which strategy to use
export const UseStrategy = AttributeFactory.create<string | string[]>('UseStrategy')

// Attribute to mark endpoint as public
export const Public = AttributeFactory.create<boolean>('Public')

@Injectable()
class PassportGuard implements CanActivate {
  private passport = inject(PassportService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    // Check if endpoint is marked public
    const isPublic = context.getAttribute(Public)
    if (isPublic) {
      return true
    }

    const request = context.getRequest()
    const strategies = context.getAttribute(UseStrategy) ?? ['jwt']
    const strategyList = Array.isArray(strategies) ? strategies : [strategies]

    // Try each strategy until one succeeds
    for (const strategyName of strategyList) {
      try {
        const user = await this.passport.authenticate(strategyName, request)
        if (user) {
          request.user = user
          return true
        }
      } catch {
        continue
      }
    }

    return false
  }
}
```

### Using Guards in Controllers

```typescript
import { Controller, Endpoint, EndpointParams, UseGuards } from '@navios/core'
import { Injectable, inject } from '@navios/di'

@Controller()
@UseGuards(PassportGuard)
@Injectable()
class ProfileController {
  private userService = inject(UserService)

  @Endpoint(getProfileEndpoint)
  @UseStrategy('jwt')
  async getProfile(params: EndpointParams<typeof getProfileEndpoint>) {
    // Access user from request (set by guard)
    const user = params.request.user
    return user
  }

  @Endpoint(updateProfileEndpoint)
  @UseStrategy('jwt')
  async updateProfile(params: EndpointParams<typeof updateProfileEndpoint>) {
    const user = params.request.user
    return this.userService.update(user.id, params.data)
  }
}
```

### Multi-Strategy Guard

```typescript
@Controller()
@UseGuards(PassportGuard)
@Injectable()
class ApiController {
  @Endpoint(getDataEndpoint)
  @UseStrategy(['jwt', 'api-key']) // Try JWT first, then API key
  async getData(params: EndpointParams<typeof getDataEndpoint>) {
    const user = params.request.user
    return this.dataService.getForUser(user.id)
  }
}
```

---

## Auth Controller

```typescript
import { Controller, Endpoint, EndpointParams, UseGuards } from '@navios/core'
import { Injectable, inject } from '@navios/di'
import { PassportService } from '@navios/passport'
import * as endpoints from './auth.endpoints'

@Controller()
@Injectable()
class AuthController {
  private passport = inject(PassportService)
  private authService = inject(AuthService)

  @Endpoint(endpoints.loginEndpoint)
  async login(params: EndpointParams<typeof endpoints.loginEndpoint>) {
    // Authenticate with local strategy
    const user = await this.passport.authenticate('local', params.request, {
      body: params.data,
    })

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const token = await this.authService.generateToken(user)
    return { user, token }
  }

  @Endpoint(endpoints.registerEndpoint)
  async register(params: EndpointParams<typeof endpoints.registerEndpoint>) {
    const user = await this.authService.register(params.data)
    const token = await this.authService.generateToken(user)
    return { user, token }
  }

  @Endpoint(endpoints.getProfileEndpoint)
  @UseGuards(PassportGuard)
  @UseStrategy('jwt')
  async getProfile(params: EndpointParams<typeof endpoints.getProfileEndpoint>) {
    return params.request.user
  }

  @Endpoint(endpoints.googleAuthEndpoint)
  async googleAuth(params: EndpointParams<typeof endpoints.googleAuthEndpoint>) {
    const redirectUrl = await this.passport.getAuthorizationUrl('google')
    return { redirectUrl }
  }

  @Endpoint(endpoints.googleCallbackEndpoint)
  async googleCallback(params: EndpointParams<typeof endpoints.googleCallbackEndpoint>) {
    const { code, state } = params.query

    const user = await this.passport.handleOAuthCallback('google', {
      code,
      state,
    })

    const token = await this.authService.generateToken(user)
    return { user, token }
  }
}
```

---

## Custom Strategies

### API Key Strategy

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as CustomStrategy } from 'passport-custom'
import { inject } from '@navios/di'

export const ApiKeyAuth = providePassportStrategy(
  'api-key',
  CustomStrategy,
  async () => {
    const apiKeyService = await inject(ApiKeyService)

    return {
      validate: async (request: Request) => {
        const apiKey = request.headers['x-api-key']

        if (!apiKey) {
          throw new UnauthorizedException('API key required')
        }

        const keyRecord = await apiKeyService.validate(apiKey)

        if (!keyRecord) {
          throw new UnauthorizedException('Invalid API key')
        }

        return keyRecord.user
      },
    }
  }
)
```

### LDAP Strategy

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as LdapStrategy } from 'passport-ldapauth'
import { inject } from '@navios/di'

export const LdapAuth = providePassportStrategy(
  'ldap',
  LdapStrategy,
  async () => {
    const config = await inject(ConfigService)
    const userService = await inject(UserService)

    return {
      server: {
        url: config.ldap.url,
        bindDN: config.ldap.bindDN,
        bindCredentials: config.ldap.bindPassword,
        searchBase: config.ldap.searchBase,
        searchFilter: '(uid={{username}})',
      },
      validate: async (ldapUser: LdapUser) => {
        let user = await userService.findByEmail(ldapUser.mail)

        if (!user) {
          user = await userService.create({
            email: ldapUser.mail,
            name: ldapUser.cn,
            externalId: ldapUser.uid,
            provider: 'ldap',
          })
        }

        return user
      },
    }
  }
)
```

### SAML Strategy

```typescript
import { providePassportStrategy } from '@navios/passport'
import { Strategy as SamlStrategy } from '@node-saml/passport-saml'
import { inject } from '@navios/di'

export const SamlAuth = providePassportStrategy(
  'saml',
  SamlStrategy,
  async () => {
    const config = await inject(ConfigService)
    const userService = await inject(UserService)

    return {
      entryPoint: config.saml.entryPoint,
      issuer: config.saml.issuer,
      cert: config.saml.cert,
      callbackUrl: '/auth/saml/callback',
      validate: async (profile: SamlProfile) => {
        const email = profile.nameID
        let user = await userService.findByEmail(email)

        if (!user) {
          user = await userService.create({
            email,
            name: profile.displayName,
            provider: 'saml',
            providerId: profile.nameID,
          })
        }

        return user
      },
    }
  }
)
```

---

## PassportService API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportService } from '@navios/passport'

@Injectable()
class AuthService {
  private passport = inject(PassportService)
}
```

### authenticate(strategy, request, options?)

Authenticate a request using a strategy.

```typescript
const user = await this.passport.authenticate('jwt', request)

// With additional options
const user = await this.passport.authenticate('local', request, {
  body: { email, password },
})
```

### getAuthorizationUrl(strategy, options?)

Get OAuth authorization URL.

```typescript
const url = await this.passport.getAuthorizationUrl('google', {
  state: 'custom-state',
  scope: ['email', 'profile'],
})
```

### handleOAuthCallback(strategy, params)

Handle OAuth callback.

```typescript
const user = await this.passport.handleOAuthCallback('google', {
  code: authCode,
  state: stateParam,
})
```

---

## Role-Based Access

```typescript
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext, AttributeFactory } from '@navios/core'

// Create role attribute
export const RequireRole = AttributeFactory.create<string[]>('RequireRole')

@Injectable()
class RoleGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user

    if (!user) {
      return false
    }

    const requiredRoles = context.getAttribute(RequireRole)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    return requiredRoles.includes(user.role)
  }
}

// Usage
@Controller()
@UseGuards(PassportGuard, RoleGuard)
@UseStrategy('jwt')
@Injectable()
class AdminController {
  @Endpoint(adminOnlyEndpoint)
  @RequireRole(['admin'])
  async adminOnly(params: EndpointParams<typeof adminOnlyEndpoint>) {
    return { message: 'Admin access granted' }
  }

  @Endpoint(moderatorEndpoint)
  @RequireRole(['admin', 'moderator'])
  async moderatorAccess(params: EndpointParams<typeof moderatorEndpoint>) {
    return { message: 'Moderator access granted' }
  }
}
```

---

## Complete Example

```typescript
// auth/strategies.ts
import { providePassportStrategy } from '@navios/passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { Strategy as LocalStrategy } from 'passport-local'
import { inject } from '@navios/di'

export const JwtAuth = providePassportStrategy('jwt', JwtStrategy, async () => {
  const config = await inject(ConfigService)
  const userService = await inject(UserService)

  return {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.jwt.secret,
    validate: async (payload: { sub: string }) => {
      const user = await userService.findById(payload.sub)
      if (!user) throw new UnauthorizedException()
      return user
    },
  }
})

export const LocalAuth = providePassportStrategy('local', LocalStrategy, async () => {
  const authService = await inject(AuthService)

  return {
    usernameField: 'email',
    validate: async (email: string, password: string) => {
      const user = await authService.validateUser(email, password)
      if (!user) throw new UnauthorizedException('Invalid credentials')
      return user
    },
  }
})
```

```typescript
// auth/auth.guard.ts
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext, AttributeFactory } from '@navios/core'
import { PassportService } from '@navios/passport'

export const UseStrategy = AttributeFactory.create<string | string[]>('UseStrategy')
export const Public = AttributeFactory.create<boolean>('Public')

@Injectable()
export class AuthGuard implements CanActivate {
  private passport = inject(PassportService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    if (context.getAttribute(Public)) {
      return true
    }

    const request = context.getRequest()
    const strategies = context.getAttribute(UseStrategy) ?? ['jwt']
    const strategyList = Array.isArray(strategies) ? strategies : [strategies]

    for (const strategyName of strategyList) {
      try {
        const user = await this.passport.authenticate(strategyName, request)
        if (user) {
          request.user = user
          return true
        }
      } catch {
        continue
      }
    }

    return false
  }
}
```

```typescript
// auth/auth.controller.ts
import { Controller, Endpoint, EndpointParams, UseGuards } from '@navios/core'
import { Injectable, inject } from '@navios/di'
import { PassportService } from '@navios/passport'
import { AuthGuard, UseStrategy, Public } from './auth.guard'
import * as endpoints from './auth.endpoints'

@Controller()
@Injectable()
export class AuthController {
  private passport = inject(PassportService)
  private authService = inject(AuthService)

  @Endpoint(endpoints.login)
  @Public()
  async login(params: EndpointParams<typeof endpoints.login>) {
    const user = await this.passport.authenticate('local', params.request, {
      body: params.data,
    })

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    return this.authService.login(user)
  }

  @Endpoint(endpoints.register)
  @Public()
  async register(params: EndpointParams<typeof endpoints.register>) {
    return this.authService.register(params.data)
  }

  @Endpoint(endpoints.getProfile)
  @UseGuards(AuthGuard)
  @UseStrategy('jwt')
  async getProfile(params: EndpointParams<typeof endpoints.getProfile>) {
    return params.request.user
  }

  @Endpoint(endpoints.refreshToken)
  @UseGuards(AuthGuard)
  @UseStrategy('jwt-refresh')
  async refreshToken(params: EndpointParams<typeof endpoints.refreshToken>) {
    return this.authService.refreshTokens(params.request.user)
  }
}
```

```typescript
// auth/auth.module.ts
import { Module } from '@navios/core'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'

@Module({
  controllers: [AuthController],
  providers: [AuthGuard],
})
export class AuthModule {}
```

---

## Common Strategies

| Strategy | Package | Use Case |
|----------|---------|----------|
| JWT | `passport-jwt` | JWT Bearer tokens |
| Local | `passport-local` | Username/password |
| Google | `passport-google-oauth20` | Google OAuth 2.0 |
| GitHub | `passport-github2` | GitHub OAuth |
| SAML | `@node-saml/passport-saml` | SAML 2.0 SSO |
| LDAP | `passport-ldapauth` | LDAP/Active Directory |
| API Key | `passport-headerapikey` | API key auth |
| Custom | `passport-custom` | Custom logic |

---

## Open Questions

1. **Session support**: How to integrate sessions with request-scoped DI?
2. **Refresh tokens**: Built-in refresh token rotation?
3. **Rate limiting**: Use `@navios/throttle` for login attempts?
4. **Adapter parity**: Ensure feature parity across Fastify/Bun?
5. **Type inference**: Better types for strategy validate functions?

---

## Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `passport` | ^0.7.x | Core Passport library |

Strategy-specific packages are optional peer dependencies.

---

## Related Packages

- `@navios/jwt` - Direct JWT handling without Passport
- `@navios/better-auth` - Modern alternative to Passport
- `@navios/throttle` - Rate limiting for auth endpoints
