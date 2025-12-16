import type { AnyXmlNode, AsyncXmlNode, ClassComponentNode, XmlNode } from '../types/xml-node.mjs'
import type { ComponentClass } from '../types/component.mjs'

import { isComponentClass } from '../decorators/component.decorator.mjs'
import { AsyncComponent, ClassComponent, Fragment } from '../types/xml-node.mjs'

type SyncComponent = (props: any) => XmlNode | AsyncXmlNode | ClassComponentNode
type AsyncComponentFn = (props: any) => Promise<XmlNode | AsyncXmlNode | ClassComponentNode>
type FunctionalComponent = SyncComponent | AsyncComponentFn
type ComponentType = FunctionalComponent | ComponentClass

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
): XmlNode | AsyncXmlNode | ClassComponentNode {
  const { children, ...restProps } = props ?? {}
  const flatChildren = flattenChildren(children)

  // Handle class components - create ClassComponentNode for later resolution
  if (isComponentClass(type)) {
    return {
      type: ClassComponent,
      componentClass: type,
      props: { ...restProps, children: flatChildren },
    }
  }

  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...restProps, children: flatChildren })

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
    children: flatChildren,
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
): XmlNode | AsyncXmlNode | ClassComponentNode {
  const flatChildren = flattenChildren(children)

  // Handle class components - create ClassComponentNode for later resolution
  if (isComponentClass(type)) {
    return {
      type: ClassComponent,
      componentClass: type,
      props: { ...props, children: flatChildren },
    }
  }

  // Handle function components (sync or async)
  if (typeof type === 'function') {
    const result = type({ ...props, children: flatChildren })

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
    children: flatChildren,
  }
}

export { Fragment }
