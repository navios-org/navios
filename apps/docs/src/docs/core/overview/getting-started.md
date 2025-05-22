# Getting started

In this section, we will guide you through the process of setting up your development environment and creating your first app using Navios.

## Prerequisites

Please make sure that [Node.js](https://nodejs.org/en/download/) (version >= 22) is installed on your machine.

## Manual Creation of a new project

Create a new project by running the following command:

```bash
npm init
# or
yarn init
```

This will create a new `package.json` file in your project directory.

Install Typescript and Navios:

```bash
npm install --save-dev typescript @navios/core @navios/cli @navios/builder
# or
yarn add -D typescript @navios/core @navios/cli @navios/builder
```

Set `"type": "module"` in your `package.json` to enable ES modules:

```json
{
  "type": "module"
}
```

Setup Typescript configuration (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "moduleResolution": "Node16",
    "moduleDefinitions": "Node16",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

Please note that we are using the `Node16` module to use ES modules.

Important! Please do not enable `experimentalDecorators` or `emitDecoratorMetatada` in your `tsconfig.json` file, as it is not needed and will cause issues with the decorators used in Navios.

In your `package.json`, add the following script to run the Navios CLI:

```json
{
  "scripts": {
    "serve": "navios serve",
    "build": "navios build"
  }
}
```

Create a new directory called `src` in your project root. This is where you will create your app.

Create a new file called `main.ts` in the `src` directory. This is where you will define your app.

```typescript
import type { NaviosApplication } from '@navios/core'

import { LoggerInstance, NaviosFactory } from '@navios/core'

import { AppModule } from './app/app.module.js'

async function createApp() {
  const app = await NaviosFactory.create(AppModule)
  return app
}

export const app = await createApp()

if (import.meta.env.PROD) {
  LoggerInstance.log(`Running in production mode...`, 'Bootstrap')

  await app.listen({
    port: '4800',
    host: '0.0.0.0',
  })
}
```

This code creates a new Navios application using the `NaviosFactory` and the `AppModule`. It also starts the server if the app is running in production mode.

Create a first module, `app.module.ts`, in the `src/app` directory:

```typescript
import { Module } from '@navios/core'

import { AppController } from './app.controller.js'

@Module({
  controllers: [AppController],
})
export class AppModule {}
```

This code defines a new module called `AppModule` that contains a single controller, `AppController`. The `AppController` will handle incoming requests to the app.

Create a new file called `app.controller.ts` in the `src/app` directory:

```typescript
import { Controller } from '@navios/core'

@Controller()
export class AppController {}
```
