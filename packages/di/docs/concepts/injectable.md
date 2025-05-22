# @Injectable decorator

The `@Injectable` decorator is used to define a class or a factory class as an injectable service.

## Parameters

The `@Injectable` decorator accepts the following fields in its options:

- `token`: The injection token to use for the service. If not provided, will create a new token using the class itself.
- `scope`: The lifetime of the service. Accepts `InjectableScope.Singleton` or `InjectableScope.Instance`. By default, it will be `InjectableScope.Singleton`.
- `type`: The type of the service. Accepts `InjectableType.Class` or `InjectableType.Factory`. By default, it will be `InjectableType.Class`.
- `registry`: The registry to use for the service. Uses the default registry if not provided.

## Usage

Injectable can be used as a class decorator or a factory decorator.

Inside a class that you're decorating with `@Injectable` you can use `inject` and `syncInject` functions to inject the services.

```ts
@Injectable()
class GreeterService {
  sayHello(name: string) {
    return `Hello ${name}`
  }
}

@Injectable()
class UserService {
  private readonly greeterService = syncInject(GreeterService)

  makeGreeting(name: string) {
    return this.greeterService.sayHello(name)
  }
}
```

Please note that `syncInject` can be used only with services that are created with `InjectableScope.Singleton`.

If you need to inject a service that is created with `InjectableScope.Instance`, you can use `inject` function. and it will return a Promise.

For example:

```ts
@Injectable({ scope: InjectableScope.Instance })
class GreeterService {
  private readonly createdAt = new Date()

  sayHello(name: string) {
    return `Hello ${name} ${this.createdAt.toISOString()}`
  }
}

@Injectable()
class UserService {
  private readonly greeterService = inject(GreeterService)

  async makeGreeting(name: string) {
    const service = await this.greeterService
    return service.sayHello(name)
  }
}
```

## Examples

### Simple class

```ts
@Injectable()
class GreeterService {
  sayHello(name: string) {
    return `Hello ${name}`
  }
}

const greeterService = await inject(GreeterService)
console.log(greeterService.sayHello('John'))
```

### Simple Factory

```ts
@Injectable({ type: InjectableType.Factory })
class GreeterServiceFactory {
  create() {
    return new GreeterService()
  }
}

const greeterService = await inject(GreeterServiceFactory)
console.log(greeterService.sayHello('John'))
```

### Class with token

```ts
export interface GreeterServiceInterface {
  sayHello(name: string): string
}

const GreeterServiceParams = z.object({
  context: z.string(),
})

export const GREETER_SERVICE = InjectionToken.create<
  GreeterServiceInterface,
  typeof GreeterServiceParams
>('GreeterService', GreeterServiceParams)

@Injectable({ token: GREETER_SERVICE })
class GreeterService {
  constructor(private readonly config: z.infer<typeof GreeterServiceParams>) {}

  sayHello(name: string) {
    return `Hello ${name} ${this.config.context}`
  }
}

const greeterService = await inject(GREETER_SERVICE, { context: 'World' })
console.log(greeterService.sayHello('John'))
```

### Factory with token

```ts
export interface GreeterServiceInterface {
  sayHello(name: string): string
}

const GreeterServiceParams = z.object({
  context: z.string(),
})

export const GREETER_SERVICE = InjectionToken.create<
  GreeterServiceInterface,
  typeof GreeterServiceParams
>('GreeterService', GreeterServiceParams)

@Injectable({ type: InjectableType.Factory, token: GREETER_SERVICE })
class GreeterServiceFactory {
  create(ctx: FactoryContext, args: z.infer<typeof GreeterServiceParams>) {
    return new GreeterService(args)
  }
}

const greeterService = await inject(GREETER_SERVICE, { context: 'World' })
console.log(greeterService.sayHello('John'))
```

## InjectableScope

The `InjectableScope` enum defines the scope of the service.

- `InjectableScope.Singleton`: The service will be created once and reused.
- `InjectableScope.Instance`: The service will be created every time it is injected.

## InjectableType

The `InjectableType` enum defines the type of the service.

- `InjectableType.Class`: The service will be a class.
- `InjectableType.Factory`: The service will be a factory.

## Registry

The `Registry` is the registry of the service. It is used to store the service and its dependencies.

## FactoryContext

The `FactoryContext` is the context of the factory. It is used to add additional information to the factory.

Context API:

- `inject`: Injects the service, same as global inject, but additionally it will track the dependencies of the service.
- `on`: Adds a listener to the service locator event bus.
- `getDependencies`: Returns the dependencies of the service.
- `invalidate`: Invalidates self and all the services that depend on it.
- `addEffect`: Adds an effect to the service. Effect is a function that will be called when the service is invalidated.
- `setTtl`: Sets the ttl of the service.
- `getTtl`: Returns the ttl of the service.
- `locator`: Returns the service locator you are currently in.
