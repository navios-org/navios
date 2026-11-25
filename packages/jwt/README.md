# @navios/jwt

JSON Web Tokens for [Navios](https://navios.tech) applications. It wraps [`jsonwebtoken`](https://github.com/auth0/node-jsonwebtoken) in an injectable service: configure it once, then sign and verify tokens wherever the service is injected.

**[Documentation](https://navios.tech/docs/server/guides/authentication)** — bearer-token authentication from start to finish: a login endpoint, a guard, public routes and tests.

## Install

```bash
npm install @navios/jwt
```

`@navios/core` is a peer dependency. No schema library is required.

## Example

```ts
import { inject, Injectable } from '@navios/core'
import { provideJwtService, TokenExpiredError } from '@navios/jwt'

export const Jwt = provideJwtService({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: '15m' },
  verifyOptions: { algorithms: ['HS256'] },
})

interface SessionPayload {
  sub: string
  roles: string[]
}

@Injectable()
export class SessionService {
  private readonly jwt = inject(Jwt)

  issue(userId: string, roles: string[]) {
    return this.jwt.sign({ sub: userId, roles } satisfies SessionPayload)
  }

  read(token: string) {
    try {
      return this.jwt.verify<SessionPayload>(token)
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return null
      }
      throw error
    }
  }
}
```

`provideJwtService` returns an injection token with the configuration attached. Export it from one file; every `inject()` of it gives the same `JwtService`. List the accepted `algorithms` when verifying, and never use `decode()` for an access decision: it does not check the signature.

## What else it does

| Need                                      | How                                                        | Docs                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Configuration from another service        | `provideJwtService(async (ctx) => ...)`                    | [Configure the service](https://navios.tech/docs/server/guides/authentication#configure-the-service)           |
| RSA and ECDSA key pairs                   | `privateKey`, `publicKey`                                  | [Asymmetric keys](https://navios.tech/docs/server/guides/authentication#asymmetric-keys)                       |
| Key rotation, a key per token             | `secretOrKeyProvider`, `RequestType`                       | [Choosing the key per token](https://navios.tech/docs/server/guides/authentication#choosing-the-key-per-token) |
| Sign, verify and decode, sync or async    | `sign`, `signAsync`, `verify`, `verifyAsync`, `decode`     | [The service](https://navios.tech/docs/server/guides/authentication#the-service)                               |
| Tell an expired token from an invalid one | `TokenExpiredError`, `NotBeforeError`, `JsonWebTokenError` | [Errors](https://navios.tech/docs/server/guides/authentication#errors)                                         |
| Protect every route, leave some public    | a guard on the root module and a `Public` attribute        | [Verify in a guard](https://navios.tech/docs/server/guides/authentication#verify-in-a-guard)                   |
| The current user in a handler             | a context key set by the guard                             | [Read the user in a handler](https://navios.tech/docs/server/guides/authentication#read-the-user-in-a-handler) |
| A fake service in tests                   | `provide(JwtServiceToken, FakeJwtService)`                 | [Replacing the service](https://navios.tech/docs/server/guides/authentication#replacing-the-service)           |

## Which key is used

`secret`, `privateKey` and `publicKey` accept a string, a `Buffer` or a Node.js `KeyObject`, in the configuration and in the options of a single call.

For each call the first of these that is set is used:

1. `secret`, then `privateKey` (sign) or `publicKey` (verify), passed to the call
2. `secretOrKeyProvider` of the service
3. `secret`, then `privateKey` or `publicKey`, of the service

So a key passed to one call always wins over the configuration, including the provider. The key is never chosen by the algorithm of the token; list the accepted `algorithms` yourself.

`secretOrKeyProvider` may return a promise, for example to fetch a key from a JWKS endpoint:

```ts
export const Jwt = provideJwtService({
  secretOrKeyProvider: async (requestType, tokenOrPayload) => {
    if (requestType === RequestType.Sign) {
      return signingKey
    }
    return keys.get(decodeKeyId(tokenOrPayload))
  },
  verifyOptions: { algorithms: ['RS256'] },
})
```

With an asynchronous provider use `signAsync()` and `verifyAsync()`; `sign()` and `verify()` throw, because they cannot wait for the key.

A string payload is signed as is: the claim defaults in `signOptions` (`expiresIn`, `issuer` and so on) are not applied to it, and passing one of them with a string payload throws.

## Upgrading from 1.x

The configuration factory receives a `FactoryContext`, and the Zod schemas were replaced by plain types, so `zod` is no longer a peer dependency. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosjwt), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
