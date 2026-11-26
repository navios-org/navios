# @navios/jwt

JSON Web Tokens for [Navios](https://navios.tech) applications. An injectable service: configure it once, then sign and verify tokens wherever the service is injected.

**[Documentation](https://navios.tech/docs/server/guides/authentication)** — bearer-token authentication from start to finish: a login endpoint, a guard, public routes and tests.

## Install

```bash
npm install @navios/jwt@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/di` is a peer dependency, so the service works in an application of `@navios/di` alone as well as in one of `@navios/core` (which depends on it). No schema library is required.

## Example

```ts
import { inject, Injectable } from '@navios/core'
import { provideJwtService, TokenExpiredError } from '@navios/jwt'

export const Jwt = provideJwtService({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: '15m', audience: 'session' },
  verifyOptions: { algorithms: ['HS256'], audience: 'session' },
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

`provideJwtService` returns an injection token with a configured service behind it. Export it from one file; every `inject()` of it gives the same `JwtService`. Every call makes a service of its own, so an application with access and refresh tokens has two; give each an `audience`. Never use `decode()` for an access decision: it does not check the signature.

The configuration is checked when the service is first resolved. A key that is empty or cannot be parsed, and an option without a value, stop the application with an error that names them, instead of rejecting every token later. A `secret` should have at least 32 random bytes; a shorter one is a warning, once per process.

## What else it does

| Need                                      | How                                                        | Docs                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Configuration from another service        | `provideJwtService(async (ctx) => ...)`                    | [Configure the service](https://navios.tech/docs/server/guides/authentication#configure-the-service)           |
| RSA and ECDSA key pairs                   | `privateKey`, `publicKey`                                  | [Asymmetric keys](https://navios.tech/docs/server/guides/authentication#asymmetric-keys)                       |
| Key rotation, a key per tenant            | `keys`                                                     | [Choosing the key per token](https://navios.tech/docs/server/guides/authentication#choosing-the-key-per-token) |
| Sign, verify and decode, sync or async    | `sign`, `signAsync`, `verify`, `verifyAsync`, `decode`     | [The service](https://navios.tech/docs/server/guides/authentication#the-service)                               |
| Tell an expired token from an invalid one | `TokenExpiredError`, `NotBeforeError`, `JsonWebTokenError` | [Errors](https://navios.tech/docs/server/guides/authentication#errors)                                         |
| Protect every route, leave some public    | a guard on the root module and a `Public` attribute        | [Verify in a guard](https://navios.tech/docs/server/guides/authentication#verify-in-a-guard)                   |
| The current user in a handler             | a context key set by the guard                             | [Read the user in a handler](https://navios.tech/docs/server/guides/authentication#read-the-user-in-a-handler) |
| A fake service in tests                   | `provide(Jwt, FakeJwtService)`                             | [Replacing the service](https://navios.tech/docs/server/guides/authentication#replacing-the-service)           |

## Which key is used

`secret`, `privateKey` and `publicKey` accept a string, a `Uint8Array` (so also a `Buffer`) or a Node.js `KeyObject`, in the configuration and in the options of a single call. A string or bytes in `privateKey` and `publicKey` are a PEM; for DER or JWK pass a `KeyObject` made with `createPublicKey()` or `createPrivateKey()`. RSA, RSA-PSS and ECDSA keys are supported, EdDSA is not.

For each call the first of these that is set is used:

1. `secret`, then `privateKey` (sign) or `publicKey` (verify), passed to the call
2. `keys` of the service
3. `secret`, then `privateKey` or `publicKey`, of the service

So a key passed to one call always wins over the configuration. A key that is passed but `undefined` or empty is an error; it does not fall back to the key of the service.

The key decides which algorithms are possible: a `secret` verifies only HMAC, a public key only the algorithms of its type, whatever the token says. `algorithms` narrows them further.

`keys` chooses a key per token or payload. It may return a promise, for example to fetch a key from a JWKS endpoint:

```ts
export const Jwt = provideJwtService({
  keys: async (request) =>
    request.use === 'sign'
      ? { key: signingKey, keyid: signingKeyId }
      : publicKeys.get(request.header.kid ?? ''),
  verifyOptions: { algorithms: ['RS256'] },
})
```

`undefined`, also as the `key` of `{ key, algorithms }`, means that there is no such key, and the token is rejected. It is rejected too when `keys` returns something else that is not a key, or a key of a type that is not supported: the sender chooses the `kid`. An empty string or empty bytes are still an error of the application. With an asynchronous function use `signAsync()` and `verifyAsync()`; `sign()` and `verify()` throw, because they cannot wait for the key.

## Options of a call

They are merged over the `signOptions` or `verifyOptions` of the service. An option that is `undefined` is not given and never switches off a configured check. When signing, `null` leaves out a default claim, and a default is not applied to a claim the payload already has.

A string payload is signed as is: the claim defaults in `signOptions` (`expiresIn`, `issuer` and so on) are not applied to it, and passing one of them with a string payload throws. `verify()` accepts only object payloads.

## Upgrading from 1.x

The configuration factory receives a `FactoryContext`, `secretOrKeyProvider` is replaced by `keys`, keys and options are checked when the service is created, and the Zod schemas were replaced by plain types, so `zod` is no longer a peer dependency. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosjwt), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
