import { AppConfig } from './app.config.mjs'
import { createApp } from './create-app.mjs'

const app = await createApp()
const config = await app.get(AppConfig)
const url = await app.listen({ port: config.getOrThrow('port'), hostname: 'localhost' })
console.log(`Notes are served at ${url}. Run \`yarn auth:migrate\` first.`)
