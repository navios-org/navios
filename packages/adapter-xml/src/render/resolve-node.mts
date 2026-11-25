import { AsyncComponent, ClassComponent, FunctionComponentSymbol } from '../nodes/xml-node.mjs'

import type { XmlComponent } from '../components/xml-component.mjs'
import type {
  AnyXmlNode,
  AsyncXmlNode,
  ClassComponentNode,
  FunctionComponentNode,
} from '../nodes/xml-node.mjs'

import { MissingContainerError } from './errors.mjs'

import type { RenderEnvironment } from './render-environment.mjs'

/**
 * Runs components until a node that can be written is left: text, a number,
 * CDATA, raw XML, an element or a fragment.
 */
export async function resolveNode(node: AnyXmlNode, env: RenderEnvironment): Promise<AnyXmlNode> {
  let current = node
  for (;;) {
    if (current == null || typeof current !== 'object') {
      return current
    }
    if (isFunctionComponentNode(current)) {
      // Function components are called here, not when the JSX is evaluated,
      // so that they receive the request context.
      current = (await current.component(current.props, env.ctx)) as AnyXmlNode
    } else if (isClassComponentNode(current)) {
      // Class components: a new instance from the container, with the props
      // as constructor argument (validated when the component declares a
      // schema).
      if (!env.container) {
        throw new MissingContainerError(current.componentClass.name)
      }
      const instance = (await env.container.get(
        current.componentClass as any,
        current.props,
      )) as XmlComponent
      current = (await instance.render(env.ctx)) as AnyXmlNode
    } else if (isAsyncNode(current)) {
      current = await current.promise
    } else {
      return current
    }
  }
}

function isFunctionComponentNode(node: unknown): node is FunctionComponentNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    'type' in node &&
    node.type === FunctionComponentSymbol
  )
}

function isClassComponentNode(node: unknown): node is ClassComponentNode {
  return node !== null && typeof node === 'object' && 'type' in node && node.type === ClassComponent
}

function isAsyncNode(node: unknown): node is AsyncXmlNode {
  return node !== null && typeof node === 'object' && 'type' in node && node.type === AsyncComponent
}
