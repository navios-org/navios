import { flattenChildren } from '../jsx/create-element.mjs'
import { ClassComponent, Fragment, FunctionComponentSymbol } from '../nodes/xml-node.mjs'

import type { XmlComponent } from '../components/xml-component.mjs'
import type { AnyXmlNode, ClassComponentNode, FunctionComponentNode } from '../nodes/xml-node.mjs'

import { MissingContainerError } from './errors.mjs'

import type { RenderEnvironment } from './render-environment.mjs'

/**
 * Runs components and awaits promises until a node that can be written is
 * left: text, a number, CDATA, raw XML, an element or a fragment.
 */
export async function resolveNode(node: AnyXmlNode, env: RenderEnvironment): Promise<AnyXmlNode> {
  let current = node
  for (;;) {
    if (current == null || typeof current !== 'object') {
      // A boolean renders nothing, as `{flag && <item />}` does.
      return typeof current === 'boolean' ? null : current
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
    } else if (isThenable(current)) {
      // A promise in the tree, such as `<item>{load()}</item>`, is awaited
      // like the result of an async component, and its value resolved again.
      current = (await current) as AnyXmlNode
    } else if (Array.isArray(current)) {
      // An array from a component or a promise is a list of siblings, as it
      // is between the tags of an element.
      return { type: Fragment, props: {}, children: flattenChildren(current) }
    } else {
      return current
    }
  }
}

function isThenable(value: object): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown }).then === 'function'
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
