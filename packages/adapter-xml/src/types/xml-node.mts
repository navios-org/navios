import type { ComponentClass } from './component.mjs'

export const Fragment = Symbol.for('xml.fragment')
export const AsyncComponent = Symbol.for('xml.async')
export const CDataSymbol = Symbol.for('xml.cdata')
export const RawXmlSymbol = Symbol.for('xml.raw')
export const ClassComponent = Symbol.for('xml.class-component')

/** Represents a CDATA section - content is wrapped in <![CDATA[...]]> */
export interface CDataNode {
  type: typeof CDataSymbol
  content: string
}

/** Represents raw XML content - inserted without any escaping or wrapping */
export interface RawXmlNode {
  type: typeof RawXmlSymbol
  content: string
}

/** Represents a class component that needs to be resolved via DI */
export interface ClassComponentNode {
  type: typeof ClassComponent
  componentClass: ComponentClass
  props: Record<string, unknown>
}

export interface XmlNode {
  type: string | typeof Fragment
  props: Record<string, unknown>
  children: AnyXmlNode[]
}

/** Represents an async component that needs to be resolved before rendering */
export interface AsyncXmlNode {
  type: typeof AsyncComponent
  promise: Promise<AnyXmlNode>
}

/** Union type for all possible node types */
export type AnyXmlNode =
  | XmlNode
  | AsyncXmlNode
  | CDataNode
  | RawXmlNode
  | ClassComponentNode
  | string
  | number
  | null
  | undefined
