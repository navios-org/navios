import type {
  AbstractHttpHandlerAdapterInterface,
  ClassType,
  HandlerMetadata,
  ScopedContainer,
} from '@navios/core'

import {
  inject,
  Injectable,
  StreamAdapterToken,
  XmlStreamAdapterToken,
} from '@navios/core'

import type { BaseXmlStreamConfig } from '../types/config.mjs'
import type { AnyXmlNode } from '../types/xml-node.mjs'

import { renderToXml } from '../runtime/render-to-xml.mjs'

@Injectable({
  token: XmlStreamAdapterToken,
})
export class XmlStreamAdapterService implements AbstractHttpHandlerAdapterInterface {
  /** Base stream adapter - we proxy hasSchema, prepareArguments, provideSchema to it */
  protected streamAdapter = inject(StreamAdapterToken)

  /**
   * Proxy to base StreamAdapter - reuses existing argument preparation logic
   * (handles querySchema, requestSchema, URL params for both Fastify and Bun)
   */
  prepareArguments(handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>) {
    return this.streamAdapter.prepareArguments?.(handlerMetadata) ?? []
  }

  provideSchema(
    handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>,
  ): Record<string, any> {
    if (
      'provideSchema' in this.streamAdapter &&
      typeof this.streamAdapter.provideSchema === 'function'
    ) {
      return this.streamAdapter.provideSchema(handlerMetadata)
    }
    return {}
  }

  hasSchema(handlerMetadata: HandlerMetadata<any>): boolean {
    if (
      'hasSchema' in this.streamAdapter &&
      typeof this.streamAdapter.hasSchema === 'function'
    ) {
      return this.streamAdapter.hasSchema(handlerMetadata)
    }
    return false
  }

  /**
   * Custom handler - renders JSX to XML and handles response for both Fastify and Bun
   */
  provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>,
  ): (context: ScopedContainer, request: any, reply: any) => Promise<any> {
    const getters = this.prepareArguments(handlerMetadata)
    const config = handlerMetadata.config

    const formatArguments = async (request: any) => {
      const argument: Record<string, any> = {}
      const promises: Promise<void>[] = []
      for (const getter of getters) {
        const res = getter(argument, request)
        if (res instanceof Promise) {
          promises.push(res)
        }
      }
      await Promise.all(promises)
      return argument
    }

    const contentType = config.contentType ?? 'application/xml'

    return async (context: ScopedContainer, request: any, reply: any) => {
      const controllerInstance = await context.get(controller)
      const argument = await formatArguments(request)

      // Call controller method - returns XmlNode (JSX), may contain async/class components
      const xmlNode: AnyXmlNode =
        await controllerInstance[handlerMetadata.classMethod](argument)

      // Render JSX to XML string (async - resolves all async and class components)
      const xml = await renderToXml(xmlNode, {
        declaration: config.xmlDeclaration ?? true,
        encoding: config.encoding ?? 'UTF-8',
        container: context,
      })

      // Environment detection: Bun doesn't have reply
      const isHttpStandardEnvironment = reply === undefined

      if (isHttpStandardEnvironment) {
        // Bun: return Response object
        const headers: Record<string, string> = {
          'Content-Type': contentType,
        }
        for (const [key, value] of Object.entries(handlerMetadata.headers)) {
          if (value != null) {
            headers[key] = String(value)
          }
        }
        return new Response(xml, {
          status: handlerMetadata.successStatusCode,
          headers,
        })
      } else {
        // Fastify: use reply object
        reply
          .status(handlerMetadata.successStatusCode)
          .header('Content-Type', contentType)
          .headers(handlerMetadata.headers)
          .send(xml)
      }
    }
  }
}
