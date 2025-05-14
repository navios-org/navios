# Navios DI

Navios DI is a library that implements the Dependency Injection pattern. It provides you with basic tools to create and manage your services

## Installation

```bash
npm install @navios/di
# or
yarn add @navios/di
```

## Simple Usage example

```ts
import { Injectable, inject, syncInject } from '@navios/di';

@Injectable()
class GreeterService {
  getFoo(user: string): string {
    return `Hello ${user}`;
  }
}

@Injectable()
class UserService {
  private readonly greeterService = syncInject(GreeterService);
  
  greet(user: string): string {
    return this.greeterService.getFoo(user);
  }
}

const userService = await inject(UserService);

console.log(userService.greet('World')); // Hello World
```

## Usage with Injection Token

```ts
import { Injectable, inject, syncInject, InjectionToken } from '@navios/di';
import { z } from 'zod';

const schema = z.object({
  user: z.string(),
})

interface GreeterInterface {
  getFoo(): string;
}

const token = new InjectionToken<GreeterInterface, typeof schema>(
  Symbol.for('user'),
  schema,
)

@Injectable({
  token,
})
class GreeterService {
  constructor(private readonly config: z.infer<typeof schema>) {}

  getFoo(): string {
    return `Hello ${this.config.user}`;
  }
}

const greetWorld = await inject(token, {
  user: 'World'
})
const BoundGreeterService = InjectionToken.bound(token, {
  user: 'Earth'
})

const greetEarth = await inject(BoundGreeterService);

console.log(greetWorld.getFoo()); // Hello World
console.log(greetEarth.getFoo()); // Hello Earth

```
