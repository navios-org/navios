---
title: Authentication with JWT
---

# Authentication with JWT

`@navios/jwt` signs and verifies JSON Web Tokens in an injectable service. This page builds bearer-token authentication with it from start to finish: a login endpoint signs a token, a guard verifies it and stores the user for the request, and an attribute marks the routes that need no token.

```bash
npm install @navios/jwt@next
```

The package needs a runtime with the Node.js APIs: it uses key objects of `node:crypto`, `Buffer` and `process`, and signs with [`jsonwebtoken`](https://github.com/auth0/node-jsonwebtoken). It runs on Node.js, Bun and Deno. On Cloudflare Workers it needs the `nodejs_compat` flag and is untested there.

## Configure the service

`provideJwtService` returns an injection token with a configured service behind it. Create it once and export it; every `inject()` of it gives the same `JwtService` instance.

```ts title="jwt.mts"
import { provideJwtService } from '@navios/jwt'

export const Jwt = provideJwtService({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: '15m', audience: 'access' },
  verifyOptions: { algorithms: ['HS256'], audience: 'access' },
})
```

| Option                    | Meaning                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `secret`                  | Key for the symmetric algorithms (`HS256`, `HS384`, `HS512`), at least 32 random bytes               |
| `privateKey`, `publicKey` | Key pair for the asymmetric algorithms (`RS256`, `ES256`, `PS256` and their variants)                |
| `signOptions`             | Defaults for signing: `expiresIn`, `algorithm`, `issuer`, `audience`, `subject` and the rest         |
| `verifyOptions`           | Defaults for verifying: `algorithms`, `issuer`, `audience`, `clockTolerance`, `maxAge` and the rest  |
| `keys`                    | `(request) => key`, called for every sign and verify instead of the keys above                       |

The algorithms a token may use follow from the key: a `secret` verifies only HMAC, a public key only the algorithms of its type. List `algorithms` in `verifyOptions` to narrow them further. A time span is a number of seconds or a string with a unit (`'15m'`); `'900'` is refused.

The `audience` ties a token to one purpose. An application that also issues refresh tokens has a second service with an audience of its own; without it, a refresh token signed with the same key would pass as an access token:

```ts
export const RefreshJwt = provideJwtService(
  {
    secret: process.env.JWT_SECRET,
    signOptions: { expiresIn: '30d', audience: 'refresh' },
    verifyOptions: { algorithms: ['HS256'], audience: 'refresh' },
  },
  { name: 'RefreshJwt' },
)
```

Every call of `provideJwtService` is a service of its own; `name` is what error messages call it.

When the configuration comes from another service, pass a function. It receives a [factory context](/docs/di/essentials/factories), may be asynchronous, and runs once, the first time the service is resolved:

```ts
export const Jwt = provideJwtService(async (ctx) => {
  const config = await ctx.inject(AuthConfig)
  return { secret: config.jwtSecret, signOptions: { expiresIn: '15m' } }
})
```

The configuration is checked when the service is first resolved, which for a service injected into a guard is when the application starts. A key that is empty, `undefined` or cannot be parsed, or an option without a value, rejects with a `DIError` whose code is `InitializationError` and whose message names the key. So a missing environment variable stops the start instead of turning every request into a 401. A `secret` shorter than 32 bytes is a warning, once per process. To configure no key at all, leave the properties out.

### Asymmetric keys

With an RSA or ECDSA key pair the private key signs and the public key verifies, so services that only verify need only the public key:

```ts
import { readFileSync } from 'node:fs'

export const Jwt = provideJwtService({
  privateKey: readFileSync('private.pem'),
  publicKey: readFileSync('public.pem'),
  signOptions: { expiresIn: '15m' },
  verifyOptions: { algorithms: ['RS256'] },
})
```

A string, `Buffer` or `Uint8Array` is a PEM. For another encoding pass a `KeyObject`: `createPublicKey({ key, format: 'der', type: 'spki' })` or `createPublicKey({ key: jwk, format: 'jwk' })` from `node:crypto`. A PEM in an environment variable often contains the two characters `\n` instead of line breaks and is refused; replace them with `value.replaceAll('\\n', '\n')`. An encrypted private key is `{ key, passphrase }`. EdDSA keys are not supported.

### Choosing the key per token

`keys` picks the key for each call, for example by the `kid` header of the token when keys are rotated, or per tenant. It is called with `{ use: 'verify', header }`, the parsed header of the token, or with `{ use: 'sign', payload }`.

```ts
import { createPrivateKey, createPublicKey } from 'node:crypto'

import { provideJwtService } from '@navios/jwt'

const publicKeys = new Map(
  Object.entries(publicKeyPems).map(([keyid, pem]) => [keyid, createPublicKey(pem)]),
)
const signingKey = { key: createPrivateKey(currentPem), keyid: currentKeyid }

export const Jwt = provideJwtService({
  keys: (request) =>
    request.use === 'sign' ? signingKey : publicKeys.get(request.header.kid ?? ''),
  verifyOptions: { algorithms: ['RS256'] },
})
```

- `undefined`, also as the `key` of `{ key, algorithms }`, means that there is no such key: the token is rejected with a `JsonWebTokenError`. When signing it is an error of the application.
- A token whose `kid` finds something else that is not a key (`constructor` in a plain object), or a key no supported algorithm works with (an Ed25519 key in a JWKS), is rejected too. An empty string or empty bytes are an error of the application.
- The header comes from the sender and is not verified yet. A malformed token, or one with an algorithm that is not accepted, is rejected before `keys` is called.
- Return a `KeyObject` made once, as above, so that the key is not parsed for every request. Text or bytes do not say whether they are a secret or a key pair; they need `{ key, algorithms }` or pinned `algorithms` (`algorithm` when signing).
- With `{ key, keyid, algorithms }` the `keyid` becomes the `kid` header of the signed token, and `algorithms` limits what the key is used for.
- The function may return a promise, for example for a JWKS lookup. It is awaited by `signAsync()` and `verifyAsync()`; `sign()` and `verify()` throw, because they cannot wait for the key.

Call `provideJwtService` once per service, at module level. A service made for each tenant or each key would stay in the container until it is disposed; use `keys`, or pass the key to the call.

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
import { Controller, Endpoint, inject, reply } from '@navios/server'

import type { HandlerParams } from '@navios/server'

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
} from '@navios/server'
import { JsonWebTokenError, TokenExpiredError } from '@navios/jwt'

import type { Guard, RequestContext } from '@navios/server'

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
    const token = /^Bearer +(\S+)$/i.exec(ctx.headers.get('authorization') ?? '')?.[1]
    if (token === undefined) {
      return unauthorized(ctx, 'Missing bearer token')
    }
    try {
      const payload = this.jwt.verify<{ sub: string; roles: string[] }>(token)
      ctx.set(CurrentUser, { id: payload.sub, roles: payload.roles })
      return true
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return unauthorized(ctx, 'Token expired', ', error="invalid_token"')
      }
      if (error instanceof JsonWebTokenError) {
        return unauthorized(ctx, 'Invalid token', ', error="invalid_token"')
      }
      throw error
    }
  }
}

function unauthorized(ctx: RequestContext, message: string, error = ''): never {
  ctx.reply.header('www-authenticate', `Bearer realm="api"${error}`)
  throw new UnauthorizedException(message)
}
```

- The guard throws `UnauthorizedException` instead of returning `false`, because `false` answers 403. See [Guards and interceptors](/docs/server/essentials/guards-and-interceptors).
- A 401 carries a `www-authenticate` header, which HTTP requires and clients use. Headers set on `ctx.reply` are sent with the error response. The scheme name is case-insensitive, hence the `i` flag.
- An error that is not a `JsonWebTokenError` is passed on and answers 500: the configuration or the key lookup failed, not the token.
- `verify<T>` does not validate the payload's shape; the type argument is a cast. The signature and the `audience` guarantee that your server issued the payload as an access token, so the cast is as reliable as your `sign` calls for this kind of token.
- `verify` is synchronous, so the guard adds no promise to the request. Use `verifyAsync` when `keys` returns a promise.

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
| `verify<T>(token, options?)`   | The payload, `JwtPayload` by default. Throws one of the errors below      |
| `verifyAsync<T>(token, options?)` | A promise of the payload, rejected with the same errors                |
| `decode<T>(token, options?)`   | The payload without checking the signature or expiry. Never trust its result for access decisions |

Per-call `options` are merged over the configured `signOptions` or `verifyOptions`. An option that is `undefined` is not given, so it never switches off a configured check; an empty one is an error. When signing, `null` leaves out a default claim (`expiresIn: null` is a token without `exp`), and a default is not applied to a claim the payload already has.

A call may carry its own `secret`, `privateKey` or `publicKey`, which wins over everything configured. A key that is passed but `undefined` or empty is an error; it does not fall back to the key of the service.

`verify`, `verifyAsync` and `decode` take `complete: true` to return `{ header, payload, signature }`. A verified payload is always an object; a token with another payload is rejected.

## Errors

`verify` and `verifyAsync` throw one of these for a token that cannot be accepted, whatever is wrong with it:

| Class               | When                                                      | Extra field |
| ------------------- | --------------------------------------------------------- | ----------- |
| `TokenExpiredError` | The `exp` claim has passed                                | `expiredAt` |
| `NotBeforeError`    | The `nbf` claim is in the future                          | `date`      |
| `JsonWebTokenError` | Malformed token, wrong signature, algorithm not allowed, unknown key, audience or issuer mismatch | —  |

The first two extend `JsonWebTokenError`, so test for them first. A missing key or a wrong option is a plain `Error`, so it is not answered as a wrong token. None of them is an `HttpException`: one that escapes a guard or a handler is an unexpected error and answers 500. Either translate them where you verify, as the guard above does, or map the base class once for the whole application:

```ts
app.mapError(JsonWebTokenError, () => problem(401, 'Invalid or expired token'))
```

`app.mapError` is described in [Errors](/docs/server/essentials/errors).

## Types

| Export                                 | Description                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `JwtServiceOptions`                    | The configuration `provideJwtService` takes                                                   |
| `JwtSignOptions`                       | The per-call options of `sign` and `signAsync`: the defaults of the service and a key         |
| `JwtVerifyOptions`                     | The per-call options of `verify` and `verifyAsync`: the defaults of the service and a key     |
| `JwtKeyRequest`, `JwtKeyMaterial`      | What `keys` is called with, and what it returns                                               |
| `JwtPayload`, `JwtHeader`, `JwtComplete` | The registered claims, the header, and a token taken apart                                  |
| `JwtDecodeOptions`, `ProvideJwtServiceOptions` | The options of `decode`, and the second argument of `provideJwtService` (`{ name }`)  |
| `JwtKey`, `JwtPrivateKey`, `Algorithm` | The accepted key types and the algorithm names                                                |

## Replacing the service

Each token `provideJwtService` returns can be bound to another implementation, for example a fake in a test. The other services are not affected:

```ts
import { NaviosFactory, provide } from '@navios/server'

const app = await NaviosFactory.create(AppModule, {
  adapter,
  providers: [provide(Jwt, FakeJwtService)],
})
```

The same entry works in `@Module({ providers })`, and `bind(Jwt)` of a `TestContainer` does the same. [Providers](/docs/di/essentials/providers) describes the mechanism.

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
