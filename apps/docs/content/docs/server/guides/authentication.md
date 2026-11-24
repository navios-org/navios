---
title: Authentication with JWT
---

# Authentication with JWT

`@navios/jwt` wraps the `jsonwebtoken` library in an injectable service. This page builds bearer-token authentication with it from start to finish: a login endpoint signs a token, a guard verifies it and stores the user for the request, and an attribute marks the routes that need no token.

```bash
npm install @navios/jwt
```

## Configure the service

`provideJwtService` returns an injection token with the configuration attached. Create it once and export it; every `inject()` of it gives the same `JwtService` instance.

```ts title="jwt.mts"
import { provideJwtService } from '@navios/jwt'

export const Jwt = provideJwtService({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: '15m' },
  verifyOptions: { algorithms: ['HS256'] },
})
```

| Option                    | Meaning                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `secret`                  | Key for the symmetric algorithms (`HS256`, `HS384`, `HS512`)                                         |
| `privateKey`, `publicKey` | Key pair for the asymmetric algorithms (`RS256`, `ES256`, `PS256` and their variants)                |
| `signOptions`             | Defaults for signing: `expiresIn`, `algorithm`, `issuer`, `audience`, `subject` and the rest         |
| `verifyOptions`           | Defaults for verifying: `algorithms`, `issuer`, `audience`, `clockTolerance`, `maxAge` and the rest  |
| `secretOrKeyProvider`     | `(requestType, tokenOrPayload, options) => key`, called for every sign and verify instead of the keys above |

List the accepted `algorithms` in `verifyOptions`. A verifier that accepts whatever algorithm the token names can be tricked into checking an asymmetric token with the wrong kind of key.

When the configuration comes from another service, pass a function. It receives a [factory context](/docs/di/essentials/factories), may be asynchronous, and runs once, the first time the service is resolved:

```ts
export const Jwt = provideJwtService(async (ctx) => {
  const config = await ctx.inject(AuthConfig)
  return { secret: config.jwtSecret, signOptions: { expiresIn: '15m' } }
})
```

## Sign a token at login

The login endpoint is new, so it gets a declaration. A failed login is a declared 401.

```ts title="auth.mts"
import { z } from 'zod/v4'

import { API } from './api.mjs'
import { userSchema } from './users.mjs' // from the Quick start

export const login = API.declareEndpoint({
  method: 'POST',
  url: '/auth/login',
  requestSchema: z.object({ email: z.email(), password: z.string() }),
  responseSchema: z.object({ token: z.string() }),
  errorSchema: { 401: z.object({ message: z.string() }) },
})

export const getMe = API.declareEndpoint({
  method: 'GET',
  url: '/me',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})
```

The handler checks the credentials and signs a payload. `PasswordsService` stands for however your application verifies a password; its `check` resolves to `{ id, roles }` or `null`. `Public` is defined with the guard in the next section.

```ts title="auth.controller.mts"
import { Controller, Endpoint, inject, reply } from '@navios/core'

import type { HandlerParams } from '@navios/core'

@Controller()
export class AuthController {
  private readonly jwt = inject(Jwt)
  private readonly passwords = inject(PasswordsService)

  @Public()
  @Endpoint(login)
  async login({ data }: HandlerParams<typeof login>) {
    const account = await this.passwords.check(data.email, data.password)
    if (!account) {
      return reply(401, { message: 'Wrong email or password' })
    }
    return { token: this.jwt.sign({ sub: account.id, roles: account.roles }) }
  }
}
```

`sign` adds `iat` and, because of `expiresIn`, `exp` to the payload. Keep the payload small and free of secrets: anyone holding the token can read it.

## Verify in a guard

The guard needs two small definitions. `CurrentUser` is a [context key](/docs/server/guides/request-state#context-keys), a typed per-request slot. `Public` is a flag [attribute](/docs/server/guides/attributes) for routes that skip the check.

```ts title="auth.guard.mts"
import {
  AttributeFactory,
  createContextKey,
  inject,
  Injectable,
  UnauthorizedException,
} from '@navios/core'
import { JsonWebTokenError, TokenExpiredError } from '@navios/jwt'

import type { Guard, RequestContext } from '@navios/core'

import { Jwt } from './jwt.mjs'

export interface AuthUser {
  id: string
  roles: string[]
}

export const CurrentUser = createContextKey<AuthUser>('CurrentUser')
export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

@Injectable()
export class AuthGuard implements Guard {
  private readonly jwt = inject(Jwt)

  canActivate(ctx: RequestContext) {
    if (AttributeFactory.has(Public, ctx.route)) {
      return true
    }
    const header = ctx.headers.get('authorization')
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    try {
      const payload = this.jwt.verify<{ sub: string; roles: string[] }>(header.slice(7))
      ctx.set(CurrentUser, { id: payload.sub, roles: payload.roles })
      return true
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token expired')
      }
      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token')
      }
      throw error
    }
  }
}
```

- The guard throws `UnauthorizedException` instead of returning `false`, because `false` answers 403. See [Guards and interceptors](/docs/server/essentials/guards-and-interceptors).
- `verify<T>` does not validate the payload's shape; the type argument is a cast. The signature guarantees that your server issued the payload, so the cast is as reliable as your `sign` calls.
- `verify` is synchronous, so the guard adds no promise to the request. Use `verifyAsync` when `secretOrKeyProvider` or the key type calls for it.

## Attach the guard

Put the guard on the root module. It then runs for every route of the application, and `@Public()` opts a handler, a controller or a whole module out.

```ts title="app.module.mts"
@Module({
  controllers: [UsersController, AuthController],
  guards: [AuthGuard],
})
export class AppModule {}
```

Guards run before the request body is read, so a request without a valid token is rejected with 401 whatever its body contains.

## Read the user in a handler

Behind the guard, `ctx.get(CurrentUser)` is the user the guard stored.

```ts
// in AuthController; users is inject(UsersService) from the Quick start
@Endpoint(getMe)
async me(_params: HandlerParams<typeof getMe>, ctx: RequestContext) {
  const { id } = ctx.get(CurrentUser)
  return this.users.findById(id) ?? reply(404, { message: 'User not found' })
}
```

On a `@Public()` route the key is not set and `ctx.get` throws; use `ctx.find(CurrentUser)` there. Checking `roles` per route is the example on the [Attributes](/docs/server/guides/attributes#reading-an-attribute) page.

## The service

`inject(Jwt)` is a `JwtService`:

| Method                         | Result                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- |
| `sign(payload, options?)`      | The token                                                                 |
| `signAsync(payload, options?)` | A promise of the token                                                    |
| `verify<T>(token, options?)`   | The payload. Throws one of the errors below                               |
| `verifyAsync<T>(token, options?)` | A promise of the payload, rejected with the same errors                |
| `decode<T>(token, options?)`   | The payload without checking the signature or expiry. Never trust its result for access decisions |

Per-call `options` are merged over the configured `signOptions` or `verifyOptions`, and may carry their own `secret`, `privateKey` or `publicKey`.

## Errors

`verify` and `verifyAsync` throw the error classes of `jsonwebtoken`, re-exported by `@navios/jwt`:

| Class               | When                                                      | Extra field |
| ------------------- | --------------------------------------------------------- | ----------- |
| `TokenExpiredError` | The `exp` claim has passed                                | `expiredAt` |
| `NotBeforeError`    | The `nbf` claim is in the future                          | `date`      |
| `JsonWebTokenError` | Malformed token, wrong signature, algorithm not allowed, audience or issuer mismatch | —  |

The first two extend `JsonWebTokenError`, so test for them first. None of them is an `HttpException`: one that escapes a guard or a handler is an unexpected error and answers 500. Either translate them where you verify, as the guard above does, or map the base class once for the whole application:

```ts
app.mapError(JsonWebTokenError, () => problem(401, 'Invalid or expired token'))
```

`app.mapError` is described in [Errors](/docs/server/essentials/errors).

## Testing protected routes

In a test, resolve the same service from the application and sign a token for the user you need:

```ts
const jwt = await app.get(Jwt)
const call = createTestClient(app, {
  headers: { authorization: `Bearer ${jwt.sign({ sub: '1', roles: ['admin'] })}` },
})

expect((await call(getMe)).status).toBe(200)
```

Creating `app` and the test client is covered in [Testing](/docs/server/essentials/testing).
