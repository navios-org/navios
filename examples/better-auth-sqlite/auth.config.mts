// Read by the Better Auth CLI: `yarn auth:migrate`, `yarn auth:generate`, `yarn auth:check`.
// The scripts run the CLI on Bun (`bun --bun x auth`), which loads the application's standard
// decorators. On Node the CLI's own loader compiles them in the legacy form and fails.
import { authForCli } from '@navios/better-auth'

import { AppModule } from './src/app.module.mjs'
import { Auth } from './src/auth.mjs'

export default authForCli(Auth, { module: AppModule })
