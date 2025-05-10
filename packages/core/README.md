# Navios

Navios is a Type-Safe HTTP Server with Zod Validation.

It is a powerful tool for building robust and type-safe APIs using TypeScript. It leverages the power of Zod for validation and provides a simple and intuitive API for defining endpoints, request and response schemas, and handling errors.

It uses Fastify under the hood, which is a fast and low-overhead web framework for Node.js. This allows Navios to provide high performance and low latency for your APIs.

## Features

- **Type Safety**: Navios provides a type-safe API for defining endpoints, request and response schemas. This ensures that your API is always type-safe and reduces the risk of runtime errors.
- **Validation**: Zod provides powerful validation capabilities, allowing you to define complex validation rules for your data. This ensures that the data you work with is always valid and meets your requirements.
- **Build with Navios Builder**: Navios Builder is a powerful HTTP client that simplifies API requests. By combining it with Navios, you can use the same API definition for both the client and server, ensuring consistency and reducing duplication.
- **Declarative API**: The API is designed to be declarative, allowing you to define your API endpoints and their schemas in a clear and concise manner. This makes it easy to understand and maintain your API client.
- **Customizable**: The package allows you to customize the behavior of the API client, such as using a custom client.
- **Error Handling**: The package provides built-in error handling capabilities, allowing you to handle API errors gracefully and provide meaningful feedback to users.

## Main Concepts

- **Module**: A module is a collection of controllers, and other modules. It is used to group related functionality together and provide a clear structure for your API. It also can define some shared guards and attributes.
- **Controller**: A controller is a class that defines a set of endpoints for a specific resource. It is used to handle incoming requests and return responses. Controllers can also define guards and attributes that apply to all endpoints in the controller.
- **Endpoint**: An endpoint is a specific route in your API that handles a specific request. It used original endpoint definition from Navios Builder, and a set of request and response schemas. Endpoints can also define guards and attributes that apply to the endpoint.
- **Service**: A service is a class that defines the business logic for a specific resource. It is used to separate the business logic from the controller and provide a clear structure for your API.
- **Guard**: A guard is a class that is used to validate incoming requests and ensure that they meet certain criteria. Guards can be used to validate request parameters, headers, and body. They can also be used to check authentication and authorization.
- **Attribute**: An attribute is a decorator that is used to add metadata to a class or method. Attributes can be used in guards, controllers, modules, and endpoints to provide additional information about the class or method.
 

## Getting Started

### Define your API

Define your API in a shared location accessible to both the client and server. This allows you to use the same API definition for both the client and server, ensuring consistency and reducing duplication.

```ts
import { builder } from '@navios/core'
import { z } from 'zod'

const api = builder({
  useDiscriminatorResponse: true,
})

const login = api.declareEndpoint({
  method: 'post',
  url: '/login',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
})
```

### Create your server

```bash
yarn install --save @navios/core @navios/common zod
```

Create AuthService:

```ts
import { Injectable } from '@navios/core'

@Injectable()
export class LoginService {
  async login(email: string, password: string) {
    // Perform your login logic here
    // For example, check the email and password against a database
  }
}
```

Create your first Controller:

```ts
import { Controller, Endpoint, type EndpointParams, syncInject } from '@navios/core'

import { AuthService } from './auth.service.mjs'

@Controller()
export class AuthController {
  // Inject the LoginService
  loginService = syncInject(LoginService)

  @Endpoint(login)
  async login(request: EndpointParams<typeof login>) {
    // Handle the login request
    const { email, password } = request

    // Perform your login logic here
    const user = await this.loginService.login(email, password)

    if (user) {
      return { success: true, user }
    } else {
      return { success: false, error: 'Invalid credentials' }
    }
  }
}
```
Create your AppModule:

```ts
import { Module } from '@navios/core'

import { AuthController } from './auth.controller.mjs'

@Module({
  controllers: [AuthController],
})
export class AppModule {}
```

Create your server:

```ts
import { NaviosFactory } from '@navios/core'
import { AppModule } from './src/app.module.mjs'

export async function boot() {
  const app = await NaviosFactory.create(AppModule)
  app.setGlobalPrefix('/api')
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}
await boot()
```

That's it! You have created your first Navios server. You can now run your server and test the `/api/login` endpoint.
