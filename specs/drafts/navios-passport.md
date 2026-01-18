# @navios/passport Specification (DRAFT)

> **Status:** Draft - This specification is under development and subject to change.

## Overview

`@navios/passport` provides integration with [Passport.js](http://www.passportjs.org/) - the most popular authentication middleware for Node.js. It brings Passport's extensive strategy ecosystem to Navios with full DI support.

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

- **Strategy registration** - Register strategies via DI
- **Guard integration** - Use strategies in `@UseGuards()`
- **Session support** - Optional session-based auth
- **Multi-strategy** - Support multiple auth methods
- **Type safety** - Typed user objects and strategies

---

## Proposed API

### Basic Setup

```typescript
import { Module } from '@navios/core'
import { PassportModule } from '@navios/passport'

@Module({
  imports: [
    PassportModule.register(),
  ],
})
class AppModule {}
```

### With JWT Strategy

```typescript
import { Module } from '@navios/core'
import { PassportModule, PassportStrategy } from '@navios/passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { Injectable, inject } from '@navios/di'

// Define the strategy as a provider
@Injectable()
class JwtAuthStrategy extends PassportStrategy(JwtStrategy, 'jwt') {
  private userService = inject(UserService)

  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      ignoreExpiration: false,
    })
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userService.findById(payload.sub)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    return user
  }
}

@Module({
  imports: [PassportModule.register()],
  providers: [JwtAuthStrategy],
})
class AuthModule {}
```

### With Local Strategy (Username/Password)

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportStrategy } from '@navios/passport'
import { Strategy as LocalStrategy } from 'passport-local'

@Injectable()
class LocalAuthStrategy extends PassportStrategy(LocalStrategy, 'local') {
  private authService = inject(AuthService)

  constructor() {
    super({
      usernameField: 'email',
      passwordField: 'password',
    })
  }

  async validate(email: string, password: string): Promise<User> {
    const user = await this.authService.validateUser(email, password)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return user
  }
}
```

### With OAuth Strategy

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportStrategy } from '@navios/passport'
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20'

@Injectable()
class GoogleAuthStrategy extends PassportStrategy(GoogleStrategy, 'google') {
  private userService = inject(UserService)

  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
      scope: ['email', 'profile'],
    })
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile
  ): Promise<User> {
    const { emails, displayName, photos } = profile

    // Find or create user
    let user = await this.userService.findByEmail(emails[0].value)

    if (!user) {
      user = await this.userService.create({
        email: emails[0].value,
        name: displayName,
        avatar: photos?.[0]?.value,
        provider: 'google',
        providerId: profile.id,
      })
    }

    return user
  }
}
```

---

## Guards

### AuthGuard

Use registered strategies in guards.

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { AuthGuard, CurrentUser } from '@navios/passport'

@Controller()
class ProfileController {
  // Use JWT strategy
  @Endpoint(getProfile)
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@CurrentUser() user: User) {
    return user
  }

  // Use multiple strategies (try JWT, then API key)
  @Endpoint(getData)
  @UseGuards(AuthGuard(['jwt', 'api-key']))
  async getData(@CurrentUser() user: User) {
    return this.dataService.getForUser(user.id)
  }
}
```

### Login Endpoint

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { AuthGuard } from '@navios/passport'

@Controller()
class AuthController {
  private authService = inject(AuthService)

  @Endpoint(login)
  @UseGuards(AuthGuard('local'))
  async login(@CurrentUser() user: User) {
    // User is already validated by LocalStrategy
    const token = await this.authService.generateToken(user)
    return { token, user }
  }
}
```

### OAuth Flow

```typescript
import { Controller, Endpoint, UseGuards, Redirect } from '@navios/core'
import { AuthGuard } from '@navios/passport'

@Controller()
class OAuthController {
  private authService = inject(AuthService)

  // Initiate OAuth flow
  @Endpoint(googleAuth)
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport redirects to Google
  }

  // Handle callback
  @Endpoint(googleCallback)
  @UseGuards(AuthGuard('google'))
  @Redirect()
  async googleCallback(@CurrentUser() user: User) {
    const token = await this.authService.generateToken(user)
    return `/auth/success?token=${token}`
  }
}
```

---

## Custom Strategies

Create custom authentication strategies.

### API Key Strategy

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportStrategy } from '@navios/passport'
import { Strategy as CustomStrategy } from 'passport-custom'

@Injectable()
class ApiKeyStrategy extends PassportStrategy(CustomStrategy, 'api-key') {
  private apiKeyService = inject(ApiKeyService)

  constructor() {
    super()
  }

  async validate(request: Request): Promise<User> {
    const apiKey = request.headers['x-api-key']

    if (!apiKey) {
      throw new UnauthorizedException('API key required')
    }

    const keyRecord = await this.apiKeyService.validate(apiKey)

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid API key')
    }

    return keyRecord.user
  }
}
```

### LDAP Strategy

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportStrategy } from '@navios/passport'
import { Strategy as LdapStrategy } from 'passport-ldapauth'

@Injectable()
class LdapAuthStrategy extends PassportStrategy(LdapStrategy, 'ldap') {
  private userService = inject(UserService)

  constructor() {
    super({
      server: {
        url: process.env.LDAP_URL,
        bindDN: process.env.LDAP_BIND_DN,
        bindCredentials: process.env.LDAP_BIND_PASSWORD,
        searchBase: 'dc=example,dc=com',
        searchFilter: '(uid={{username}})',
      },
    })
  }

  async validate(ldapUser: LdapUser): Promise<User> {
    // Map LDAP user to application user
    let user = await this.userService.findByEmail(ldapUser.mail)

    if (!user) {
      user = await this.userService.create({
        email: ldapUser.mail,
        name: ldapUser.cn,
        externalId: ldapUser.uid,
        provider: 'ldap',
      })
    }

    return user
  }
}
```

### SAML Strategy

```typescript
import { Injectable, inject } from '@navios/di'
import { PassportStrategy } from '@navios/passport'
import { Strategy as SamlStrategy, Profile } from '@node-saml/passport-saml'

@Injectable()
class SamlAuthStrategy extends PassportStrategy(SamlStrategy, 'saml') {
  private userService = inject(UserService)

  constructor() {
    super({
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER,
      cert: process.env.SAML_CERT,
      callbackUrl: '/auth/saml/callback',
    })
  }

  async validate(profile: Profile): Promise<User> {
    const email = profile.nameID
    let user = await this.userService.findByEmail(email)

    if (!user) {
      user = await this.userService.create({
        email,
        name: profile.displayName,
        provider: 'saml',
        providerId: profile.nameID,
      })
    }

    return user
  }
}
```

---

## Session Support

Optional session-based authentication.

### Configuration

```typescript
import { Module } from '@navios/core'
import { PassportModule } from '@navios/passport'

@Module({
  imports: [
    PassportModule.register({
      session: true,
      serializeUser: (user: User) => user.id,
      deserializeUser: async (id: string) => {
        return userService.findById(id)
      },
    }),
  ],
})
class AppModule {}
```

### Session Guard

```typescript
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { SessionGuard, CurrentUser } from '@navios/passport'

@Controller()
@UseGuards(SessionGuard)
class DashboardController {
  @Endpoint(getDashboard)
  async getDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getForUser(user.id)
  }
}
```

### Login with Session

```typescript
@Controller()
class AuthController {
  @Endpoint(login)
  @UseGuards(AuthGuard('local'))
  async login(
    @CurrentUser() user: User,
    @Session() session: SessionData
  ) {
    // User is stored in session automatically
    return { message: 'Logged in', user }
  }

  @Endpoint(logout)
  async logout(@Session() session: SessionData) {
    session.destroy()
    return { message: 'Logged out' }
  }
}
```

---

## Multiple Strategies

Support multiple authentication methods.

```typescript
import { Module } from '@navios/core'
import { PassportModule } from '@navios/passport'

@Module({
  imports: [PassportModule.register()],
  providers: [
    JwtAuthStrategy,
    LocalAuthStrategy,
    GoogleAuthStrategy,
    ApiKeyStrategy,
  ],
})
class AuthModule {}

// Use in controllers
@Controller()
class ApiController {
  // Try JWT first, then API key
  @Endpoint(getData)
  @UseGuards(AuthGuard(['jwt', 'api-key']))
  async getData(@CurrentUser() user: User) {
    return this.dataService.get()
  }
}
```

---

## Decorators

### Parameter Decorators

```typescript
import {
  CurrentUser,
  AuthInfo,
  IsAuthenticated,
} from '@navios/passport'

@Controller()
class MyController {
  @Endpoint(myEndpoint)
  async handler(
    @CurrentUser() user: User,          // Authenticated user
    @AuthInfo() info: AuthInfo,         // Strategy info
    @IsAuthenticated() isAuth: boolean, // Auth status
  ) {
    // ...
  }
}
```

### Method Decorators

```typescript
import { Public, Roles, Permissions } from '@navios/passport'

@Controller()
@UseGuards(AuthGuard('jwt'))
class ResourceController {
  @Endpoint(publicData)
  @Public() // Skip auth for this endpoint
  async getPublicData() {}

  @Endpoint(adminData)
  @Roles('admin')
  async getAdminData() {}

  @Endpoint(writeData)
  @Permissions('data:write')
  async writeData() {}
}
```

---

## Adapter Integration

### Fastify Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { PassportModule, fastifyPassport } from '@navios/passport'
import fastifySession from '@fastify/session'
import fastifyCookie from '@fastify/cookie'

@Module({
  imports: [PassportModule.register({ session: true })],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment({
      plugins: [
        fastifyCookie,
        [fastifySession, { secret: 'session-secret' }],
        fastifyPassport.initialize(),
        fastifyPassport.session(),
      ],
    }),
  })

  await app.listen({ port: 3000 })
}
```

### Bun Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { PassportModule, bunPassport } from '@navios/passport'

@Module({
  imports: [PassportModule.register()],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment({
      middleware: [bunPassport()],
    }),
  })

  await app.listen({ port: 3000 })
}
```

---

## Common Strategies

Popular strategies with Navios integration examples.

### OAuth Providers

| Strategy | Package | Use Case |
|----------|---------|----------|
| Google | `passport-google-oauth20` | Google OAuth 2.0 |
| GitHub | `passport-github2` | GitHub OAuth |
| Facebook | `passport-facebook` | Facebook Login |
| Twitter | `passport-twitter` | Twitter OAuth |
| Microsoft | `passport-azure-ad` | Azure AD / Microsoft |
| Apple | `passport-apple` | Sign in with Apple |
| LinkedIn | `passport-linkedin-oauth2` | LinkedIn OAuth |
| Discord | `passport-discord` | Discord OAuth |

### Enterprise

| Strategy | Package | Use Case |
|----------|---------|----------|
| SAML | `@node-saml/passport-saml` | SAML 2.0 SSO |
| LDAP | `passport-ldapauth` | LDAP/Active Directory |
| OAuth2 | `passport-oauth2` | Generic OAuth 2.0 |
| OIDC | `passport-openidconnect` | OpenID Connect |

### API Authentication

| Strategy | Package | Use Case |
|----------|---------|----------|
| JWT | `passport-jwt` | JWT Bearer tokens |
| API Key | `passport-headerapikey` | API key auth |
| Basic | `passport-http` | HTTP Basic auth |
| Bearer | `passport-http-bearer` | Bearer tokens |
| Custom | `passport-custom` | Custom logic |

---

## Complete Example

```typescript
// strategies/jwt.strategy.ts
import { Injectable, inject } from '@navios/di'
import { PassportStrategy, UnauthorizedException } from '@navios/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private userService = inject(UserService)

  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    })
  }

  async validate(payload: { sub: string }): Promise<User> {
    const user = await this.userService.findById(payload.sub)
    if (!user) throw new UnauthorizedException()
    return user
  }
}
```

```typescript
// strategies/local.strategy.ts
import { Injectable, inject } from '@navios/di'
import { PassportStrategy, UnauthorizedException } from '@navios/passport'
import { Strategy } from 'passport-local'

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  private authService = inject(AuthService)

  constructor() {
    super({ usernameField: 'email' })
  }

  async validate(email: string, password: string): Promise<User> {
    const user = await this.authService.validateUser(email, password)
    if (!user) throw new UnauthorizedException('Invalid credentials')
    return user
  }
}
```

```typescript
// controllers/auth.controller.ts
import { Controller, Endpoint, UseGuards } from '@navios/core'
import { AuthGuard, CurrentUser, Public } from '@navios/passport'
import { inject } from '@navios/di'

@Controller()
class AuthController {
  private authService = inject(AuthService)

  @Endpoint(login)
  @Public()
  @UseGuards(AuthGuard('local'))
  async login(@CurrentUser() user: User) {
    return this.authService.login(user)
  }

  @Endpoint(register)
  @Public()
  async register(params: EndpointParams<typeof register>) {
    return this.authService.register(params.data)
  }

  @Endpoint(getProfile)
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@CurrentUser() user: User) {
    return user
  }

  @Endpoint(refreshToken)
  @UseGuards(AuthGuard('jwt-refresh'))
  async refreshToken(@CurrentUser() user: User) {
    return this.authService.refreshTokens(user)
  }
}
```

```typescript
// modules/auth.module.ts
import { Module } from '@navios/core'
import { PassportModule } from '@navios/passport'

@Module({
  imports: [PassportModule.register()],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    AuthService,
  ],
})
export class AuthModule {}
```

---

## Open Questions

1. **Session store**: Integration with Redis for distributed sessions?
2. **Refresh tokens**: Built-in refresh token rotation?
3. **MFA**: Integration with 2FA strategies?
4. **Rate limiting**: Use `@navios/throttle` for login attempts?
5. **Adapter parity**: Ensure feature parity across Fastify/Bun?
6. **Type inference**: Better types for strategy options?

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
- `@navios/session` - Session management (planned)

---

## Implementation Priority

- [ ] Core PassportStrategy mixin
- [ ] AuthGuard implementation
- [ ] CurrentUser decorator
- [ ] JWT strategy example
- [ ] Local strategy example
- [ ] Fastify adapter integration
- [ ] Bun adapter integration
- [ ] OAuth strategies support
- [ ] Session support
- [ ] Multi-strategy guards
- [ ] SAML/LDAP enterprise strategies
