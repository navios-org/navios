// A process for shutdown-signals.spec.mts to send signals to.
import { createApplication } from '../application/application.mjs'
import { inject, registerInjectable } from '../index.mjs'
import { registerModule } from '../modules/module.mjs'

const mode = process.argv[2]
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

if (mode === 'process-1') {
  // Nothing that a signal does by default ends that one.
  Object.defineProperty(process, 'pid', { value: 1 })
  process.kill = () => true
}

class Pool {
  async onServiceDestroy() {
    await sleep(mode === 'closing' ? 300 : 50)
    console.log('closed')
  }
}
registerInjectable(Pool)

class Root {
  readonly pool = inject(Pool)

  async onModuleInit() {
    if (mode === 'starting' || mode === 'hung-init') {
      console.log('ready')
      await (mode === 'starting' ? sleep(200) : new Promise(() => setInterval(() => {}, 1000)))
    }
  }

  async onApplicationShutdown() {
    if (mode === 'hung-hook') {
      await new Promise(() => setInterval(() => {}, 1000))
    }
  }
}
registerModule(Root)

const app = createApplication(Root, {
  logger: false,
  shutdownTimeout: mode === 'hung-hook' ? 60_000 : mode === 'closing' ? 5000 : 300,
})
app.enableShutdownHooks()
setInterval(() => {}, 1000)
await app.start()
console.log('started')
if (mode === 'closing') {
  void app.close()
  await sleep(20)
}
console.log('ready')
