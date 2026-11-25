#!/usr/bin/env node
import { Cli } from 'clipanion'

import { BuildCommand } from './commands/build.mjs'
import { ServeCommand } from './commands/serve.mjs'

const cli = new Cli({
  binaryName: 'navios',
})
cli.register(BuildCommand)
cli.register(ServeCommand)

cli.runExit(process.argv.slice(2))
