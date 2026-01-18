import { Command, Option } from 'clipanion'
import { createBuilder, mergeConfig } from 'vite'

import type { UserConfig } from 'vite'

import { ViteNaviosPlugin } from '../plugin/index.js'
import { getVideConfig, hasViteConfig } from '../utils/vite.js'

export class BuildCommand extends Command {
  static paths = [['build']]

  static usage = Command.Usage({
    description: 'Build the project if vite.config.ts is present',
    details: 'This command checks for a vite.config.ts file and runs a Vite build if found.',
    examples: [['Build the project', 'navios build']],
  })

  appPath = Option.String('--app-path', './src/main.ts', {
    description: 'Path to the app entry file',
  })

  appExport = Option.String('--app-export', 'app', {
    description: 'Name of the app export',
  })

  async execute(): Promise<number> {
    let serverConfig: UserConfig = {
      plugins: [
        ...ViteNaviosPlugin({
          appPath: this.appPath,
          exportName: this.appExport,
        }),
      ],
    }
    if (hasViteConfig()) {
      serverConfig = mergeConfig(
        {
          root: process.cwd(),
          configFile: getVideConfig(),
        },
        serverConfig,
      )
    }

    console.log(serverConfig)

    this.context.stdout.write('Starting Vite development server...\n')

    try {
      const builder = await createBuilder(serverConfig)
      for (const env of Object.values(builder.environments)) {
        await builder.build(env)
      }
      return 0
    } catch (error) {
      this.context.stderr.write(`Error starting Vite server: ${error}\n`)
      return 1
    }
  }
}
