import type { AnyXmlNode, AsyncXmlNode, XmlNode } from '../types/xml-node.mjs'

import { AsyncComponent, Fragment } from '../types/xml-node.mjs'

type SyncComponent = (props: any) => XmlNode | AsyncXmlNode
type AsyncComponentFn = (props: any) => Promise<XmlNode | AsyncXmlNode>
type ComponentType = SyncComponent | AsyncComponentFn

function flattenChildren(children: any[]): AnyXmlNode[] {
  return children.flat(Infinity).filter((c) => c != null && c !== false)
}

export function createElement(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
  ...children: any[]
): XmlNode | AsyncXmlNode {
  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...props, children: flattenChildren(children) })

    // If component returns a Promise, wrap it in AsyncXmlNode
    if (result instanceof Promise) {
      return {
        type: AsyncComponent,
        promise: result,
      }
    }

    return result
  }

  return {
    type,
    props: props ?? {},
    children: flattenChildren(children),
  }
}

export { Fragment }
