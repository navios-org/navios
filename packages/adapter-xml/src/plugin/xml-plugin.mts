import { definePlugin } from '@navios/core'

import type { RequestContext, RouteResult } from '@navios/core'

import { renderToXml } from '../render/render-to-xml.mjs'
import { XML_RESULT_KIND } from '../response/xml.mjs'

import type { XmlPayload, XmlResponseOptions } from '../response/xml.mjs'

/**
 * Defaults for every `xml()` response of the application. Options passed to
 * `xml()` win over them.
 */
export type XmlPluginOptions = Omit<XmlResponseOptions, 'status'>

function withCharset(contentType: string): string {
  return /;\s*charset=/i.test(contentType) ? contentType : `${contentType}; charset=utf-8`
}

/**
 * Lets handlers answer with `xml(<Tree />)` on any adapter.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 *   plugins: [xmlPlugin()],
 * })
 * ```
 *
 * It registers the encoder of the `xml` response kind. The encoder runs
 * inside the route pipeline: components get the request context, and an
 * error thrown while rendering goes through the application's error
 * handling. Routes that do not return `xml()` are not touched.
 *
 * Options are defaults for every `xml()` response: `contentType`,
 * `declaration`, `encoding`, `pretty`.
 */
export const xmlPlugin = definePlugin({
  name: 'xml',
  setup(api, defaults: XmlPluginOptions | void) {
    const container = api.container

    api.encoder(
      XML_RESULT_KIND,
      async (result: RouteResult, ctx: RequestContext): Promise<RouteResult> => {
        const payload = result.body as XmlPayload
        const options = { ...defaults, ...payload.options }
        const body = await renderToXml(payload.node, {
          declaration: options.declaration,
          encoding: options.encoding,
          pretty: options.pretty,
          container,
          ctx,
        })
        return {
          ...result,
          kind: 'text',
          body,
          headers: {
            ...result.headers,
            'content-type': withCharset(options.contentType ?? 'application/xml'),
          },
        }
      },
    )
  },
})
