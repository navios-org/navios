import { Module, NaviosFactory } from '@navios/core'
import { defineInMemoryEnvironment } from '@navios/core/testing'

import type { ClassType, NaviosApplication, NaviosApplicationOptions } from '@navios/core'

import { generateOpenApiDocument } from '../index.mjs'

import type { OpenApiDocument, OpenApiGenerationOptions, OpenApiOperation } from '../index.mjs'

const apps: NaviosApplication<any>[] = []

/** Creates and initialises an in-memory application from controllers. */
export async function createApp(
  controllers: ClassType[],
  options: Partial<NaviosApplicationOptions<any>> = {},
): Promise<NaviosApplication<any>> {
  @Module({ controllers })
  class AppModule {}
  return createAppFromModule(AppModule, options)
}

export async function createAppFromModule(
  module: ClassType,
  options: Partial<NaviosApplicationOptions<any>> = {},
): Promise<NaviosApplication<any>> {
  const app = await NaviosFactory.create(module, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    ...options,
  })
  apps.push(app)
  await app.init()
  return app
}

export async function closeApps(): Promise<void> {
  await Promise.all(apps.splice(0).map((app) => app.close()))
}

export const silent = { warn: () => {}, debug: () => {} }

/** Generates the document of an application made of the given controllers. */
export async function documentOf(
  controllers: ClassType[],
  options: Partial<OpenApiGenerationOptions> = {},
): Promise<OpenApiDocument> {
  const app = await createApp(controllers)
  return generateOpenApiDocument(app.routes(), {
    info: { title: 'Test API', version: '1.0.0' },
    logger: silent,
    ...options,
  })
}

export function operation(
  document: OpenApiDocument,
  method: string,
  path: string,
): OpenApiOperation {
  const found = document.paths[path]?.[method]
  if (!found) {
    throw new Error(`No ${method} ${path} in ${JSON.stringify(Object.keys(document.paths))}`)
  }
  return found
}
