import type { FunctionComponent } from '../components/function-component.mjs'
import type { ComponentClass } from '../components/xml-component.mjs'

import type { CDataNode } from './cdata.mjs'
import type { RawXmlNode } from './raw-xml.mjs'

export const Fragment = Symbol.for('xml.fragment')
export const ClassComponent = Symbol.for('xml.class-component')
export const FunctionComponentSymbol = Symbol.for('xml.function-component')

/** Represents a class component that is resolved via DI when the tree is rendered */
export interface ClassComponentNode {
  type: typeof ClassComponent
  componentClass: ComponentClass
  props: Record<string, unknown>
}

/** Represents a function component that is called when the tree is rendered */
export interface FunctionComponentNode {
  type: typeof FunctionComponentSymbol
  component: FunctionComponent<any>
  props: Record<string, unknown>
}

export interface XmlNode {
  type: string | typeof Fragment
  props: Record<string, unknown>
  children: AnyXmlNode[]
}

/**
 * What a JSX expression evaluates to, as far as the type checker knows.
 *
 * The package's JSX typings (`@navios/adapter-xml/jsx`) declare `JSX.Element`
 * loosely, as any object, so every place that takes the result of a JSX
 * expression has to accept `object` next to the precise node types. At run
 * time the value is an `AnyXmlNode`, an array of them, or a promise of either,
 * which is awaited when the tree is rendered.
 */
export type XmlRenderable = AnyXmlNode | object

/** Union type for all possible node types */
export type AnyXmlNode =
  | XmlNode
  | CDataNode
  | RawXmlNode
  | ClassComponentNode
  | FunctionComponentNode
  | string
  | number
  | null
  | undefined

/** Whether `node` is a node object of the given type, such as `CDataSymbol`. */
export function isNodeOfType<Type extends symbol>(
  node: unknown,
  type: Type,
): node is Extract<AnyXmlNode, { type: Type }> {
  return typeof node === 'object' && node !== null && (node as { type?: unknown }).type === type
}
