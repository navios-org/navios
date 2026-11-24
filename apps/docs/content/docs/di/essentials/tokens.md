---
title: Tokens
---

# Tokens

A token is the identity of a dependency. Every `@Injectable()` class has one automatically. You create one yourself when the dependency is not a class you can name: an interface with several implementations, a configuration object, a value supplied at runtime.

## Creating a token

```ts
import { InjectionToken } from '@navios/di'

export interface Clock {
  now(): number
}

export const CLOCK = InjectionToken.create<Clock>('Clock')
```

The type parameter is what `inject(CLOCK)` and `container.get(CLOCK)` return. The name appears in error messages and has no other role: a token is identified by the object, so two tokens created with the same name are different tokens. Export the token and import it wherever it is needed.

A token on its own resolves to nothing. It needs a provider, which can come from any of:

| Source                                    | Described in                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `@Injectable({ token })` on a class       | [Services and injection](/docs/di/essentials/services#implementing-a-token) |
| `@Factory({ token })` on a factory class  | [Factories](/docs/di/essentials/factories)                                 |
| `provide(token, …)` on a container        | [Providers](/docs/di/essentials/providers#provide)                         |
| `addInstance(token, value)`               | [Providers](/docs/di/essentials/providers#addinstance)                     |

To get the token of a decorated class, call `getInjectableToken(UserService)`.

## Tokens with a schema

A schema turns a token into a parameterised dependency. Whoever resolves it passes arguments, and the provider receives them validated.

```ts
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod/v4'

const bucketOptions = z.object({
  name: z.string(),
  region: z.string().default('eu-central-1'),
})

export interface Bucket {
  put(key: string, body: Uint8Array): Promise<void>
}

export const BUCKET = InjectionToken.create<Bucket, typeof bucketOptions>('Bucket', bucketOptions)

@Injectable({ token: BUCKET })
class S3Bucket implements Bucket {
  constructor(private readonly options: z.output<typeof bucketOptions>) {}

  async put(key: string, body: Uint8Array) {
    // upload to this.options.name in this.options.region
  }
}

const uploads = await container.get(BUCKET, { name: 'uploads' })
```

The schema can come from any [Standard Schema](https://standardschema.dev) library; these docs use Zod. Three rules apply:

- **Callers pass the schema's input type, the provider receives its output type.** Above, `region` may be omitted by the caller and is always present in the constructor.
- **Invalid arguments fail with `TokenValidationError`.** The schema's issues are in `error.context.issues`.
- **Validation must be synchronous.** A schema that validates asynchronously, such as one with an async refinement, is rejected with the same error.

Whether the second argument is required follows from the schema. If the schema accepts `undefined` (for example `bucketOptions.optional()`), the token can be resolved without arguments. If it does not, leaving them out changes the result type to an error message that names the missing keys, so the mistake shows up at the first use of the value.

### One instance per argument value

Instances are stored under the validated arguments, compared by value. Key order does not matter and nested values are compared in full.

```ts
const a = await container.get(BUCKET, { name: 'uploads' })
const b = await container.get(BUCKET, { region: 'eu-central-1', name: 'uploads' })
const c = await container.get(BUCKET, { name: 'exports' })

a === b // true: the default was applied before comparing
a === c // false
```

Values inside the arguments that are not plain objects or arrays, such as class instances and functions, are compared by identity.

## Bound tokens

`InjectionToken.bound()` fixes the arguments, producing a token that is resolved without any. Use it to give a configured instance a name.

```ts
export const UPLOADS = InjectionToken.bound(BUCKET, { name: 'uploads' })

@Injectable()
class AvatarService {
  private readonly bucket = inject(UPLOADS)
}
```

A bound token resolves to the same instance as the base token with equal arguments, so `inject(UPLOADS)` and `inject(BUCKET, { name: 'uploads' })` share one `S3Bucket`.

## Factory tokens

`InjectionToken.factory()` computes the arguments when the token is first resolved. The function receives a [factory context](/docs/di/essentials/factories#factorycontext), so it can read other services.

```ts
export const TENANT_BUCKET = InjectionToken.factory(BUCKET, async (ctx) => {
  const settings = await ctx.inject<SettingsService>(SettingsService)
  return { name: settings.bucketName }
})

const bucket = await container.get(TENANT_BUCKET)
```

The function runs at most once per root container, and always against the root container, even when the token is first resolved through a scope. The value is stored on the container, not on the token: two containers compute it separately, and a container that was disposed computes it again on next use.

An async function makes the first resolution asynchronous: use `get()`, or `inject()` it from a service that is itself resolved with `get()`.

## Refining a bound token's type

`InjectionToken.refineType<T>()` changes the type a bound token resolves to, without changing the token. It is for the case where the arguments select a more specific type than the base token declares.

```ts
interface VersionedBucket extends Bucket {
  listVersions(key: string): Promise<string[]>
}

export const ARCHIVE = InjectionToken.refineType<VersionedBucket>(
  InjectionToken.bound(BUCKET, { name: 'archive' }),
)
```

This is a type assertion. The container does not check it.

## Tokens that declare a scope

A token can carry a scope and no provider at all. It is then a slot that code fills per scope with `addInstance()`:

```ts
import { InjectableScope, InjectionToken } from '@navios/di'

export const REQUEST_ID = InjectionToken.create<string>('RequestId', {
  scope: InjectableScope.Request,
})
```

Declaring the scope makes misuse visible: resolving `REQUEST_ID` from the root container, or injecting it into a singleton, reports a scope mismatch instead of a missing provider. In a scope where no value was added, resolving it fails with `FactoryNotFound`. [Scopes](/docs/di/essentials/scopes#values-supplied-per-scope) shows it in use. The options object also accepts `schema`.
