# @navios/better-auth Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/better-auth` provides integration with [Better Auth](https://www.better-auth.com/) - a modern, framework-agnostic authentication library. It brings Better Auth's comprehensive feature set to Navios with full DI support and contract-first API definitions.

**Package:** `@navios/better-auth`
**Version:** 0.1.0 (planned)
**License:** MIT
**Dependencies:** `better-auth`
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Why Better Auth?

Better Auth is a modern authentication library that provides:
- **Email/Password** - Traditional authentication
- **OAuth** - Google, GitHub, Discord, and 50+ providers
- **Magic Links** - Passwordless email authentication
- **Passkeys** - WebAuthn/FIDO2 support
- **2FA** - TOTP and SMS verification
- **Organizations** - Multi-tenant support with roles
- **Sessions** - Secure session management
- **Rate Limiting** - Built-in protection

---

## Key Features (Planned)

- **Contract-first auth endpoints** - Define auth routes with builder
- **provideAuthService()** - Configure via injection token pattern
- **DI integration** - Injectable auth service via `inject()`
- **Guard integration** - Use with Navios guards
- **Session management** - Access session via request context

---

## Proposed API

### Configuration with provideAuthService

```typescript
import { InjectionToken } from '@navios/di'
import { z } from 'zod'

// Options schema
export const AuthServiceOptionsSchema = z.object({
  database: z.any(),
  baseURL: z.string().optional(),
  emailAndPassword: z.object({
    enabled: z.boolean(),
    requireEmailVerification: z.boolean().optional(),
  }).optional(),
  socialProviders: z.record(z.object({
    clientId: z.string(),
    clientSecret: z.string(),
  })).optional(),
  plugins: z.object({
    twoFactor: z.object({ enabled: z.boolean() }).optional(),
    organization: z.object({ enabled: z.boolean() }).optional(),
  }).optional(),
})

type AuthServiceOptions = z.infer<typeof AuthServiceOptionsSchema>

// Token for DI
export const AuthServiceToken = InjectionToken.create(
  Symbol.for('AuthService'),
  AuthServiceOptionsSchema,
)

// Static configuration
export function provideAuthService(
  config: AuthServiceOptions
): BoundInjectionToken<AuthService, typeof AuthServiceOptionsSchema>

// Async configuration
export function provideAuthService(
  config: () => Promise<AuthServiceOptions>
): FactoryInjectionToken<AuthService, typeof AuthServiceOptionsSchema>

export function provideAuthService(config) {
  if (typeof config === 'function') {
    return InjectionToken.factory(AuthServiceToken, config)
  }
  return InjectionToken.bound(AuthServiceToken, config)
}
```

### Basic Setup

```typescript
import { provideAuthService } from '@navios/better-auth'
import { PrismaClient } from '@prisma/client'

// Static configuration
export const AuthService = provideAuthService({
  database: new PrismaClient(),
  emailAndPassword: {
    enabled: true,
  },
})
```

### Async Configuration

```typescript
import { provideAuthService } from '@navios/better-auth'
import { inject } from '@navios/di'

// Async configuration with ConfigService
export const AuthService = provideAuthService(async () => {
  const config = await inject(ConfigService)
  const db = await inject(DatabaseService)

  return {
    database: db.client,
    baseURL: config.app.url,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    socialProviders: {
      google: {
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
      },
      github: {
        clientId: config.oauth.github.clientId,
        clientSecret: config.oauth.github.clientSecret,
      },
    },
    plugins: {
      twoFactor: { enabled: true },
      organization: { enabled: true },
    },
  }
})
```

---

## Auth Endpoints (Contract-First)

Define auth routes using the builder pattern.

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const api = builder()

// User schema
const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  emailVerified: z.boolean(),
})

const sessionSchema = z.object({
  id: z.string(),
  expiresAt: z.string(),
})

// Sign up endpoint
export const signUpEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/sign-up',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
  }),
  responseSchema: z.object({
    user: userSchema,
    session: sessionSchema,
  }),
})

// Sign in endpoint
export const signInEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/sign-in',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  responseSchema: z.object({
    user: userSchema,
    session: sessionSchema,
  }),
})

// Sign out endpoint
export const signOutEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/sign-out',
  responseSchema: z.object({
    success: z.boolean(),
  }),
})

// Get session endpoint
export const getSessionEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/auth/session',
  responseSchema: z.object({
    user: userSchema.nullable(),
    session: sessionSchema.nullable(),
  }),
})

// OAuth callback endpoint
export const oauthCallbackEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/auth/callback/$provider',
  querySchema: z.object({
    code: z.string(),
    state: z.string().optional(),
  }),
  responseSchema: z.object({
    user: userSchema,
    session: sessionSchema,
  }),
})
```

---

## Auth Controller

```typescript
import { Injectable, inject } from '@navios/di'
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { AuthService } from './auth.provider'
import * as endpoints from './auth.endpoints'

@Controller()
@Injectable()
class AuthController {
  private auth = inject(AuthService)

  @Endpoint(endpoints.signUpEndpoint)
  async signUp(params: EndpointParams<typeof endpoints.signUpEndpoint>) {
    const { email, password, name } = params.data

    const result = await this.auth.signUp({
      email,
      password,
      name,
    })

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt.toISOString(),
      },
    }
  }

  @Endpoint(endpoints.signInEndpoint)
  async signIn(params: EndpointParams<typeof endpoints.signInEndpoint>) {
    const { email, password } = params.data

    const result = await this.auth.signIn({
      email,
      password,
    })

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt.toISOString(),
      },
    }
  }

  @Endpoint(endpoints.signOutEndpoint)
  async signOut(params: EndpointParams<typeof endpoints.signOutEndpoint>) {
    await this.auth.signOut({
      headers: params.request.headers,
    })

    return { success: true }
  }

  @Endpoint(endpoints.getSessionEndpoint)
  async getSession(params: EndpointParams<typeof endpoints.getSessionEndpoint>) {
    const session = await this.auth.getSession({
      headers: params.request.headers,
    })

    if (!session) {
      return { user: null, session: null }
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt.toISOString(),
      },
    }
  }

  @Endpoint(endpoints.oauthCallbackEndpoint)
  async handleOAuthCallback(params: EndpointParams<typeof endpoints.oauthCallbackEndpoint>) {
    const { provider } = params.urlParams
    const { code, state } = params.query

    const result = await this.auth.handleOAuthCallback({
      provider,
      code,
      state,
    })

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt.toISOString(),
      },
    }
  }
}
```

---

## Guards

### Auth Guard

```typescript
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext } from '@navios/core'
import { AuthService } from './auth.provider'

@Injectable()
class AuthGuard implements CanActivate {
  private auth = inject(AuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()

    const session = await this.auth.getSession({
      headers: request.headers,
    })

    if (!session) {
      return false
    }

    // Attach session data to request for use in handlers
    request.user = session.user
    request.session = session.session

    return true
  }
}
```

### Using Guards in Controllers

```typescript
import { Controller, Endpoint, EndpointParams, UseGuards } from '@navios/core'
import { Injectable, inject } from '@navios/di'

@Controller()
@UseGuards(AuthGuard)
@Injectable()
class ProfileController {
  private userService = inject(UserService)

  @Endpoint(getProfileEndpoint)
  async getProfile(params: EndpointParams<typeof getProfileEndpoint>) {
    // Access user from request (set by guard)
    const user = params.request.user
    return user
  }

  @Endpoint(updateProfileEndpoint)
  async updateProfile(params: EndpointParams<typeof updateProfileEndpoint>) {
    const user = params.request.user
    return this.userService.update(user.id, params.data)
  }
}
```

### Role-Based Guard

```typescript
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext, AttributeFactory } from '@navios/core'

// Create a role attribute
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
@UseGuards(AuthGuard, RoleGuard)
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

## Accessing Session in Services

```typescript
import { Injectable, inject } from '@navios/di'
import { Request, UnauthorizedException } from '@navios/core'
import { AuthService } from './auth.provider'

@Injectable()
class UserProfileService {
  private auth = inject(AuthService)
  private request = inject(Request)

  async getCurrentUser() {
    const session = await this.auth.getSession({
      headers: this.request.headers,
    })

    if (!session) {
      throw new UnauthorizedException()
    }

    return session.user
  }

  async updateProfile(data: UpdateProfileDto) {
    const user = await this.getCurrentUser()

    return this.auth.updateUser({
      userId: user.id,
      data,
    })
  }
}
```

---

## Two-Factor Authentication

### 2FA Endpoints

```typescript
const api = builder()

export const enable2FAEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/2fa/enable',
  responseSchema: z.object({
    secret: z.string(),
    qrCode: z.string(),
    backupCodes: z.array(z.string()),
  }),
})

export const verify2FAEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/2fa/verify',
  requestSchema: z.object({
    code: z.string().length(6),
  }),
  responseSchema: z.object({
    success: z.boolean(),
  }),
})

export const disable2FAEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/auth/2fa/disable',
  requestSchema: z.object({
    code: z.string().length(6),
  }),
  responseSchema: z.object({
    success: z.boolean(),
  }),
})
```

### 2FA Controller

```typescript
@Controller()
@UseGuards(AuthGuard)
@Injectable()
class TwoFactorController {
  private auth = inject(AuthService)

  @Endpoint(enable2FAEndpoint)
  async enable2FA(params: EndpointParams<typeof enable2FAEndpoint>) {
    const user = params.request.user

    const result = await this.auth.twoFactor.enable({
      userId: user.id,
    })

    return result
  }

  @Endpoint(verify2FAEndpoint)
  async verify2FA(params: EndpointParams<typeof verify2FAEndpoint>) {
    const user = params.request.user

    await this.auth.twoFactor.verify({
      userId: user.id,
      code: params.data.code,
    })

    return { success: true }
  }

  @Endpoint(disable2FAEndpoint)
  async disable2FA(params: EndpointParams<typeof disable2FAEndpoint>) {
    const user = params.request.user

    await this.auth.twoFactor.disable({
      userId: user.id,
      code: params.data.code,
    })

    return { success: true }
  }
}
```

---

## Organizations (Multi-Tenant)

### Organization Endpoints

```typescript
const api = builder()

export const createOrgEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/organizations',
  requestSchema: z.object({
    name: z.string(),
    slug: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
})

export const getOrgMembersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/organizations/$orgId/members',
  responseSchema: z.array(z.object({
    userId: z.string(),
    role: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
    }),
  })),
})

export const inviteMemberEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/organizations/$orgId/invite',
  requestSchema: z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']),
  }),
  responseSchema: z.object({
    inviteId: z.string(),
  }),
})
```

### Organization Controller

```typescript
@Controller()
@UseGuards(AuthGuard)
@Injectable()
class OrganizationController {
  private auth = inject(AuthService)

  @Endpoint(createOrgEndpoint)
  async createOrg(params: EndpointParams<typeof createOrgEndpoint>) {
    const user = params.request.user

    const org = await this.auth.organization.create({
      name: params.data.name,
      slug: params.data.slug,
      ownerId: user.id,
    })

    return org
  }

  @Endpoint(getOrgMembersEndpoint)
  async getMembers(params: EndpointParams<typeof getOrgMembersEndpoint>) {
    const { orgId } = params.urlParams

    // Verify user has access to this org
    const user = params.request.user
    const membership = await this.auth.organization.getMembership({
      userId: user.id,
      orgId,
    })

    if (!membership) {
      throw new ForbiddenException('Not a member of this organization')
    }

    return this.auth.organization.getMembers({ orgId })
  }

  @Endpoint(inviteMemberEndpoint)
  async inviteMember(params: EndpointParams<typeof inviteMemberEndpoint>) {
    const { orgId } = params.urlParams
    const user = params.request.user

    // Verify user is admin
    const membership = await this.auth.organization.getMembership({
      userId: user.id,
      orgId,
    })

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return this.auth.organization.invite({
      orgId,
      email: params.data.email,
      role: params.data.role,
    })
  }
}
```

### Organization Guard

```typescript
// Attribute for required org role
export const RequireOrgRole = AttributeFactory.create<string[]>('RequireOrgRole')

@Injectable()
class OrgMemberGuard implements CanActivate {
  private auth = inject(AuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user
    const orgId = request.params.orgId

    if (!user || !orgId) {
      return false
    }

    const membership = await this.auth.organization.getMembership({
      userId: user.id,
      orgId,
    })

    if (!membership) {
      return false
    }

    // Check role if required
    const requiredRoles = context.getAttribute(RequireOrgRole)
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(membership.role)) {
        return false
      }
    }

    request.membership = membership
    request.organization = await this.auth.organization.get({ orgId })

    return true
  }
}

// Usage
@Controller()
@UseGuards(AuthGuard, OrgMemberGuard)
@Injectable()
class OrgSettingsController {
  @Endpoint(updateOrgSettings)
  @RequireOrgRole(['owner', 'admin'])
  async updateSettings(params: EndpointParams<typeof updateOrgSettings>) {
    const org = params.request.organization
    // Update settings...
  }
}
```

---

## Complete Example

```typescript
// auth/auth.provider.ts
import { provideAuthService } from '@navios/better-auth'
import { inject } from '@navios/di'

export const AuthService = provideAuthService(async () => {
  const config = await inject(ConfigService)
  const db = await inject(DatabaseService)

  return {
    database: db.client,
    baseURL: config.app.url,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    socialProviders: {
      google: {
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
      },
    },
    plugins: {
      twoFactor: { enabled: true },
      organization: { enabled: true },
    },
  }
})
```

```typescript
// auth/auth.guard.ts
import { Injectable, inject } from '@navios/di'
import { CanActivate, AbstractExecutionContext } from '@navios/core'
import { AuthService } from './auth.provider'

@Injectable()
export class AuthGuard implements CanActivate {
  private auth = inject(AuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()

    const session = await this.auth.getSession({
      headers: request.headers,
    })

    if (!session) {
      return false
    }

    request.user = session.user
    request.session = session.session
    return true
  }
}
```

```typescript
// auth/auth.controller.ts
import { Injectable, inject } from '@navios/di'
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { AuthService } from './auth.provider'
import * as endpoints from './auth.endpoints'

@Controller()
@Injectable()
export class AuthController {
  private auth = inject(AuthService)

  @Endpoint(endpoints.signUp)
  async signUp(params: EndpointParams<typeof endpoints.signUp>) {
    return this.auth.signUp(params.data)
  }

  @Endpoint(endpoints.signIn)
  async signIn(params: EndpointParams<typeof endpoints.signIn>) {
    return this.auth.signIn(params.data)
  }

  @Endpoint(endpoints.signOut)
  async signOut(params: EndpointParams<typeof endpoints.signOut>) {
    await this.auth.signOut({ headers: params.request.headers })
    return { success: true }
  }
}
```

```typescript
// auth/auth.module.ts
import { Module } from '@navios/core'
import { AuthController } from './auth.controller'
import { TwoFactorController } from './2fa.controller'
import { OrganizationController } from './org.controller'

@Module({
  controllers: [AuthController, TwoFactorController, OrganizationController],
})
export class AuthModule {}
```

---

## Open Questions

1. **Session storage**: Integration with `@navios/cache` for Redis sessions?
2. **Email sending**: Integration with `@navios/mail` for verification emails?
3. **Rate limiting**: Use `@navios/throttle` for auth endpoints?
4. **Adapter handling**: How to expose Better Auth handler to Fastify/Bun?
5. **Client SDK**: Generate typed client from auth endpoints?

---

## Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `better-auth` | ^1.x | Core authentication library |

---

## Related Packages

- `@navios/jwt` - Lower-level JWT handling
- `@navios/passport` - Alternative: Passport.js integration
- `@navios/cache` - Session caching
- `@navios/mail` - Email verification
