import type { IncomingMessage, ServerResponse } from 'node:http'

import { VitePluginNode } from 'vite-plugin-node'

import type { VitePluginNodeConfig } from 'vite-plugin-node'

let prevApp: any = null

export interface ViteNaviosPluginConfig extends Omit<
  VitePluginNodeConfig,
  'adapter' | 'tsCompiler' | 'outputFormat'
> {}

export function ViteNaviosPlugin({
  appPath,
  exportName = 'app',
  initAppOnBoot = false,
  swcOptions,
}: ViteNaviosPluginConfig) {
  return VitePluginNode({
    adapter: async ({ app, req, res }: { app: any; req: IncomingMessage; res: ServerResponse }) => {
      if (!app.isInitialized) {
        if (prevApp) await prevApp.close()

        await app.init()
        prevApp = app
      }

      const instance = app.getServer()

      await instance.ready()
      instance.routing(req, res)
    },
    appPath,
    exportName,
    tsCompiler: 'swc',
    outputFormat: 'esm',
    initAppOnBoot,
    swcOptions: {
      ...swcOptions,
      jsc: {
        target: 'es2024',
        parser: {
          syntax: 'typescript',
        },
        ...swcOptions?.jsc,
        transform: {
          decoratorVersion: '2022-03',
          ...swcOptions?.jsc?.transform,
        },
      },
    },
  })
}
