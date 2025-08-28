# Injection Token

Injection tokens are used to identify and retrieve services from the dependency injection container. They are typically defined as constants and used to inject services into classes.

## Creating an Injection Token

To create an injection token, you can use the `InjectionToken` class from the `@navios/di` or `@navios/core` package. Here's an example:

```ts
import { InjectionToken } from '@navios/di'

export const GREETER_SERVICE =
  InjectionToken.create<GreeterService>('GreeterService')

@Injectable({ token: GREETER_SERVICE })
class GreeterService {}
```

## Using an Injection Token

To use an injection token, you can inject it into a class or a function.

```ts
import { inject } from '@navios/di'

const greeterService = await inject(GREETER_SERVICE)
```

or

```ts
@Injectable()
class UserService {
  private readonly greeterService = inject(GREETER_SERVICE) // This will be a Promise<GreeterService>
  private readonly greeterServiceSync = syncInject(GREETER_SERVICE) // This will be a GreeterService
}
```

## Adding a parameter to the injection token

You can add a parameter to the injection token to make it more specific.

```ts
import { z } from 'zod/v4'

const GreeterServiceParams = z.object({
  context: z.string(),
})

export const GREETER_SERVICE = InjectionToken.create<
  GreeterService,
  typeof GreeterServiceParams
>('GreeterService', GreeterServiceParams)

@Injectable({ token: GREETER_SERVICE })
class GreeterService {}

const greeterService = await inject(GREETER_SERVICE, { context: 'Hello' })
```

## Providing a value to an injection token

You can provide a value to an injection token by using the `bound` function.

```ts
import { inject, InjectionToken } from '@navios/di'

const helloGreeterService = InjectionToken.bound(GREETER_SERVICE, {
  context: 'Hello',
})

const greeterService = await inject(helloGreeterService)
```

## Providing a factory to an injection token

You can provide a factory to an injection token by using the `factory` function.

It is useful, when you need to bind a value to a result of another service (e.g. a configuration).

```ts
import { inject, InjectionToken } from '@navios/di'

@Injectable()
class GreeterConfigService {
  getContext() {
    return 'Hello'
  }
}
const helloGreeterService = InjectionToken.factory(
  GREETER_SERVICE,
  async () => {
    const config = await inject(GreeterConfigService)
    return { context: config.getContext() }
  },
)

const greeterService = await inject(helloGreeterService)
```

## API

### `InjectionToken.create`

Creates a new injection token.

Generic arguments:

- `T`: The type of the value to bind to the injection token.
- `P`: Zod schema type of the parameters of the injection token.

Arguments:

- `name: string | Class | symbol`: The name of the injection token.
- `params: ZodSchema | undefined`: The parameters of the injection token.

Returns:

- `InjectionToken`: The new injection token.

### `InjectionToken.bound`

Creates a new injection token that is bound to a value.

Arguments:

- `token: InjectionToken`: The injection token to bind.
- `value: any`: The value to bind to the injection token.

Returns:

- `BoundInjectionToken`: The new injection token.

### `InjectionToken.factory`

Creates a new injection token that is a factory.

Arguments:

- `token: InjectionToken`: The injection token to bind.
- `factory: () => Promise<any>`: The factory to bind to the injection token.

Returns:

- `FactoryInjectionToken`: The new injection token.
