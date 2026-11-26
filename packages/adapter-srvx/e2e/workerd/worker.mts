import type { CloudflareFetchHandler, Server } from 'srvx'

import { createApp } from '../app.mjs'

// A Worker as the documentation of the adapter writes one. `../workerd.spec.mts`
// bundles it and runs it in workerd.
async function start(): Promise<CloudflareFetchHandler> {
  const app = await createApp({
    cors: { origin: ['https://site.example'] },
    serve: { maxRequestBodySize: 1024 },
  })
  await app.init()
  return (app.getServer() as unknown as Server<CloudflareFetchHandler>).fetch
}

let handler: Promise<CloudflareFetchHandler> | undefined

export default {
  async fetch(request, env, context) {
    handler ??= start()
    return (await handler)(request, env, context)
  },
} satisfies { fetch: CloudflareFetchHandler }
