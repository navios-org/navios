import { isComponentClass } from '../components/component.mjs'
import { ClassComponent, Fragment, FunctionComponentSymbol } from '../nodes/xml-node.mjs'

import type { FunctionComponent } from '../components/function-component.mjs'
import type { ComponentClass } from '../components/xml-component.mjs'
import type {
  AnyXmlNode,
  ClassComponentNode,
  FunctionComponentNode,
  XmlNode,
} from '../nodes/xml-node.mjs'

type ComponentType = FunctionComponent | ComponentClass
type ElementNode = XmlNode | ClassComponentNode | FunctionComponentNode

/** The children of an element as a flat list, without `null`, `undefined` and booleans. */
export function flattenChildren(children: any): AnyXmlNode[] {
  const list = Array.isArray(children) ? children.flat(Infinity) : [children]
  return list.filter((c) => c != null && typeof c !== 'boolean')
}

function element(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown>,
  children: AnyXmlNode[],
): ElementNode {
  // Components are not run here. The renderer builds class components through
  // the DI container and calls function components, passing both the request
  // context.
  if (isComponentClass(type)) {
    return { type: ClassComponent, componentClass: type, props: { ...props, children } }
  }
  if (typeof type === 'function') {
    return {
      type: FunctionComponentSymbol,
      component: type as FunctionComponent,
      props: { ...props, children },
    }
  }
  return { type, props, children }
}

/**
 * JSX automatic runtime function.
 * Used by the JSX transformer when jsxImportSource is set.
 * Children are passed as part of props.children.
 */
export function jsx(
  type: string | typeof Fragment | ComponentType,
  props: Record<string, unknown> | null,
): ElementNode {
  const { children, ...restProps } = props ?? {}
  return element(type, restProps, flattenChildren(children))
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
): ElementNode {
  return element(type, props ?? {}, flattenChildren(children))
}
