import type { UserConfig } from 'vite'

import { Command, Option } from 'clipanion'
import { createServer, mergeConfig } from 'vite'

import { ViteNaviosPlugin } from '../plugin/index.js'
import { getVideConfig, hasViteConfig } from '../utils/vite.js'

export class ServeCommand extends Command {
  static paths = [['serve']]

  static usage = Command.Usage({
    description: 'Start a development server if vite.config.ts is present',
    details:
      'This command checks for a vite.config.ts file and runs a Vite development server if found.',
    examples: [['Start a development server', 'navios serve']],
  })

  port = Option.String('-p,--port', {
    description: 'Port to run the server on',
  })

  appPath = Option.String('--app-path', './src/main.ts', {
    description: 'Path to the app entry file',
  })

  appExport = Option.String('--app-export', 'app', {
    description: 'Name of the app export',
  })

  host = Option.String('--host', {
    description: 'Host to expose the server',
  })

  async execute(): Promise<number> {
    let serverConfig: UserConfig = {
      server: {
        host: this.host,
      },
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

    this.context.stdout.write('Starting Vite development server...\n')

    try {
      const server = await createServer(serverConfig)
      const port = this.port
        ? parseInt(this.port, 10)
        : serverConfig.server?.port
      await server.listen(port)
      server.printUrls()
      return new Promise((resolve) => {
        process.once('SIGINT', () => {
          server.close()
          resolve(0)
        })
        process.once('SIGTERM', () => {
          server.close()
          resolve(0)
        })
        process.once('exit', () => {
          server.close()
          resolve(0)
        })
      })
    } catch (error) {
      this.context.stderr.write(`Error starting Vite server: ${error}\n`)
      return 1
    }
  }
}
