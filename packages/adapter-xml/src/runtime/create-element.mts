import type { AnyXmlNode, AsyncXmlNode, XmlNode } from '../types/xml-node.mjs'

import { AsyncComponent, Fragment } from '../types/xml-node.mjs'

type SyncComponent = (props: any) => XmlNode | AsyncXmlNode
type AsyncComponentFn = (props: any) => Promise<XmlNode | AsyncXmlNode>
type ComponentType = SyncComponent | AsyncComponentFn

function flattenChildren(children: any): AnyXmlNode[] {
  if (children == null || children === false) {
    return []
  }
  if (Array.isArray(children)) {
    return children.flat(Infinity).filter((c) => c != null && c !== false)
  }
  return [children]
}

/**
 * JSX automatic runtime function.
 * Used by the JSX transformer when jsxImportSource is set.
 * Children are passed as part of props.children.
 */
export function jsx(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
): XmlNode | AsyncXmlNode {
  const { children, ...restProps } = props ?? {}

  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...restProps, children: flattenChildren(children) })

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
    props: restProps,
    children: flattenChildren(children),
  }
}

/**
 * JSX automatic runtime function for static children.
 * Identical to jsx() for XML - React uses this for optimization hints.
 */
export const jsxs = jsx

/**
 * Classic createElement for manual usage.
 * Children are passed as rest arguments.
 */
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
