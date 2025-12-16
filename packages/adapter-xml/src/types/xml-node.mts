export const Fragment = Symbol.for('xml.fragment')
export const AsyncComponent = Symbol.for('xml.async')
export const CDataSymbol = Symbol.for('xml.cdata')
export const RawXmlSymbol = Symbol.for('xml.raw')

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
export type AnyXmlNode = XmlNode | AsyncXmlNode | CDataNode | RawXmlNode | string | number | null | undefined
