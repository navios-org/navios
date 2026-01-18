# @navios/better-auth Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/better-auth` provides seamless integration with [Better Auth](https://www.better-auth.com/) - a modern, framework-agnostic authentication library. It brings Better Auth's comprehensive auth features to Navios with full DI support.

**Package:** `@navios/better-auth`
**Version:** 0.1.0 (planned)
**License:** MIT
**Dependencies:** `better-auth`
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Why Better Auth?

Better Auth is a modern authentication library that provides:
- Email/password, OAuth, magic links, passkeys
- Session management with multiple strategies
- Two-factor authentication (TOTP, SMS, Email)
- Organization/team management
- Rate limiting and security features
- Database adapters (Prisma, Drizzle, etc.)

This integration brings all these features to Navios with minimal configuration.

---

## Key Features (Planned)

- **Zero-config setup** - Works out of the box with sensible defaults
- **DI integration** - Inject auth services anywhere
- **Guard integration** - Protect routes with `@UseGuards()`
- **Session management** - Automatic session handling
- **Adapter support** - Works with Fastify and Bun
- **Type safety** - Full TypeScript support

---

## Proposed API

### Basic Setup

```typescript
import { Module } from '@navios/core'
import { BetterAuthModule } from '@navios/better-auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

@Module({
  imports: [
    BetterAuthModule.register({
      database: prisma,
      emailAndPassword: {
        enabled: true,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24,     // Update session every 24h
      },
    }),
  ],
})
class AppModule {}
```

### With OAuth Providers

```typescript
import { Module } from '@navios/core'
import { BetterAuthModule } from '@navios/better-auth'

@Module({
  imports: [
    BetterAuthModule.register({
      database: prisma,
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID!,
          clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        },
      },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
    }),
  ],
})
class AppModule {}
```

### Advanced Configuration

```typescript
import { Module } from '@navios/core'
import { BetterAuthModule, twoFactor, organization } from '@navios/better-auth'

@Module({
  imports: [
    BetterAuthModule.register({
      database: prisma,
      baseURL: process.env.BASE_URL,
      basePath: '/api/auth',

      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        sendResetPassword: async ({ user, url }) => {
          await emailService.send({
            to: user.email,
            template: 'reset-password',
            data: { url },
          })
        },
      },

      // Plugins
      plugins: [
        twoFactor({
          issuer: 'MyApp',
          totpOptions: {
            digits: 6,
            period: 30,
          },
        }),
        organization({
          allowUserToCreateOrganization: true,
          creatorRole: 'owner',
        }),
      ],

      // Rate limiting
      rateLimit: {
        enabled: true,
        window: 60,
        max: 10,
      },

      // Session
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60, // 5 minutes
        },
      },

      // Callbacks
      onUserCreated: async (user) => {
        await analyticsService.track('user_signup', { userId: user.id })
      },
    }),
  ],
})
class AppModule {}
```

### Async Configuration

```typescript
import { Module } from '@navios/core'
import { BetterAuthModule } from '@navios/better-auth'
import { inject } from '@navios/di'

@Module({
  imports: [
    BetterAuthModule.registerAsync({
      useFactory: async () => {
        const config = await inject(ConfigService)
        const prisma = await inject(PrismaClient)

        return {
          database: prisma,
          baseURL: config.app.baseUrl,
          socialProviders: config.auth.providers,
        }
      },
    }),
  ],
})
class AppModule {}
```

---

## Auth Service

Inject the auth service for programmatic access.

```typescript
import { Injectable, inject } from '@navios/di'
import { BetterAuthService } from '@navios/better-auth'

@Injectable()
class UserService {
  private auth = inject(BetterAuthService)

  async createUser(email: string, password: string) {
    const user = await this.auth.api.signUpEmail({
      body: { email, password, name: 'John Doe' },
    })
    return user
  }

  async getUserSession(sessionToken: string) {
    const session = await this.auth.api.getSession({
      headers: { cookie: `session=${sessionToken}` },
    })
    return session
  }

  async revokeAllSessions(userId: string) {
    await this.auth.api.revokeUserSessions({
      body: { userId },
    })
  }
}
```

---

## Guards

### BetterAuthGuard

Protect routes requiring authentication.

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { BetterAuthGuard, CurrentUser, Session } from '@navios/better-auth'

@Controller()
@UseGuards(BetterAuthGuard)
class ProfileController {
  @Endpoint(getProfile)
  async getProfile(@CurrentUser() user: User) {
    return user
  }

  @Endpoint(updateProfile)
  async updateProfile(
    @CurrentUser() user: User,
    @Session() session: SessionData,
    params: EndpointParams<typeof updateProfile>
  ) {
    // Access current user and session
    return this.userService.update(user.id, params.data)
  }
}
```

### Optional Auth

Allow unauthenticated access while still extracting user if present.

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { OptionalAuthGuard, CurrentUser } from '@navios/better-auth'

@Controller()
class PublicController {
  @Endpoint(getContent)
  @UseGuards(OptionalAuthGuard)
  async getContent(@CurrentUser() user: User | null) {
    if (user) {
      // Personalized content
      return this.contentService.getForUser(user.id)
    }
    // Public content
    return this.contentService.getPublic()
  }
}
```

### Role-Based Guards

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { BetterAuthGuard, RequireRole } from '@navios/better-auth'

@Controller()
@UseGuards(BetterAuthGuard)
class AdminController {
  @Endpoint(getUsers)
  @RequireRole('admin')
  async getUsers() {
    return this.userService.findAll()
  }

  @Endpoint(deleteUser)
  @RequireRole(['admin', 'moderator'])
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    return this.userService.delete(params.userId)
  }
}
```

### Organization Guards

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import {
  BetterAuthGuard,
  RequireOrganization,
  RequireOrgRole,
  CurrentOrganization,
} from '@navios/better-auth'

@Controller()
@UseGuards(BetterAuthGuard, RequireOrganization)
class OrgController {
  @Endpoint(getOrgData)
  async getData(@CurrentOrganization() org: Organization) {
    return this.dataService.getForOrg(org.id)
  }

  @Endpoint(manageMembers)
  @RequireOrgRole(['owner', 'admin'])
  async manageMembers(
    @CurrentOrganization() org: Organization,
    params: EndpointParams<typeof manageMembers>
  ) {
    return this.orgService.updateMembers(org.id, params.data)
  }
}
```

---

## Decorators

### Parameter Decorators

```typescript
import {
  CurrentUser,
  Session,
  CurrentOrganization,
  AccessToken,
} from '@navios/better-auth'

@Controller()
class MyController {
  @Endpoint(myEndpoint)
  async handler(
    @CurrentUser() user: User,                    // Current authenticated user
    @Session() session: SessionData,              // Current session
    @CurrentOrganization() org: Organization,     // Active organization
    @AccessToken() token: string,                 // Raw access token
  ) {
    // ...
  }
}
```

### Method Decorators

```typescript
import {
  RequireAuth,
  RequireRole,
  RequirePermission,
  RequireOrgRole,
  RequireVerifiedEmail,
  Require2FA,
} from '@navios/better-auth'

@Controller()
class SecureController {
  @Endpoint(adminOnly)
  @RequireRole('admin')
  async adminOnly() {}

  @Endpoint(withPermission)
  @RequirePermission('users:write')
  async withPermission() {}

  @Endpoint(verifiedOnly)
  @RequireVerifiedEmail()
  async verifiedOnly() {}

  @Endpoint(twoFactorProtected)
  @Require2FA()
  async twoFactorProtected() {}
}
```

---

## Built-in Auth Endpoints

When configured, Better Auth automatically exposes these endpoints:

### Email/Password

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/sign-up/email` | POST | Register with email/password |
| `/api/auth/sign-in/email` | POST | Sign in with email/password |
| `/api/auth/sign-out` | POST | Sign out |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password` | POST | Reset password |
| `/api/auth/verify-email` | GET | Verify email address |

### OAuth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/sign-in/social` | GET | Initiate OAuth flow |
| `/api/auth/callback/:provider` | GET | OAuth callback |

### Session

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/session` | GET | Get current session |
| `/api/auth/sessions` | GET | List all sessions |
| `/api/auth/revoke-session` | POST | Revoke a session |
| `/api/auth/revoke-sessions` | POST | Revoke all sessions |

### Two-Factor

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/two-factor/enable` | POST | Enable 2FA |
| `/api/auth/two-factor/disable` | POST | Disable 2FA |
| `/api/auth/two-factor/verify` | POST | Verify 2FA code |

### Organization

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/organization/create` | POST | Create organization |
| `/api/auth/organization/list` | GET | List user's organizations |
| `/api/auth/organization/invite` | POST | Invite member |
| `/api/auth/organization/remove-member` | POST | Remove member |

---

## Custom Auth Endpoints

Add custom auth-related endpoints.

```typescript
import { Controller, Endpoint } from '@navios/core'
import { BetterAuthGuard, CurrentUser, BetterAuthService } from '@navios/better-auth'

@Controller()
class CustomAuthController {
  private auth = inject(BetterAuthService)

  @Endpoint(linkAccount)
  @UseGuards(BetterAuthGuard)
  async linkAccount(
    @CurrentUser() user: User,
    params: EndpointParams<typeof linkAccount>
  ) {
    // Custom account linking logic
    return this.auth.api.linkAccount({
      body: {
        userId: user.id,
        provider: params.data.provider,
        providerAccountId: params.data.accountId,
      },
    })
  }

  @Endpoint(impersonate)
  @RequireRole('admin')
  async impersonate(params: EndpointParams<typeof impersonate>) {
    // Admin impersonation
    const session = await this.auth.api.impersonateUser({
      body: { userId: params.userId },
    })
    return session
  }
}
```

---

## Adapter Integration

### Fastify Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { BetterAuthModule, fastifyBetterAuth } from '@navios/better-auth'

@Module({
  imports: [BetterAuthModule.register({ /* ... */ })],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment({
      plugins: [fastifyBetterAuth()], // Register Better Auth handler
    }),
  })

  await app.listen({ port: 3000 })
}
```

### Bun Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { BetterAuthModule, bunBetterAuth } from '@navios/better-auth'

@Module({
  imports: [BetterAuthModule.register({ /* ... */ })],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment({
      middleware: [bunBetterAuth()], // Register Better Auth handler
    }),
  })

  await app.listen({ port: 3000 })
}
```

---

## Database Schema

Better Auth requires specific database tables. With Prisma:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  accounts      Account[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  accountId         String
  providerId        String
  accessToken       String?
  refreshToken      String?
  accessTokenExpiresAt DateTime?
  refreshTokenExpiresAt DateTime?
  scope             String?
  idToken           String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

---

## Open Questions

1. **Plugin system**: How to expose Better Auth plugins cleanly?
2. **Custom providers**: Supporting custom OAuth providers?
3. **Email integration**: Integrate with `@navios/mail` for auth emails?
4. **Rate limiting**: Use `@navios/throttle` or Better Auth's built-in?
5. **Session storage**: Redis adapter for distributed sessions?
6. **Type generation**: Auto-generate types from Better Auth config?

---

## Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| `better-auth` | ^1.x | Core authentication library |

---

## Related Packages

- `@navios/jwt` - Lower-level JWT handling
- `@navios/passport` - Alternative auth with Passport.js
- `@navios/mail` - Email sending for auth flows
- `@navios/throttle` - Rate limiting

---

## Implementation Priority

- [ ] Basic module setup and configuration
- [ ] Auth service injection
- [ ] BetterAuthGuard implementation
- [ ] CurrentUser decorator
- [ ] Fastify adapter integration
- [ ] Bun adapter integration
- [ ] Role-based guards
- [ ] Organization plugin support
- [ ] Two-factor plugin support
- [ ] Session management helpers
- [ ] Custom provider support
