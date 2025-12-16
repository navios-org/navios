import type { AnyXmlNode, XmlNode } from './xml-node.mjs'

declare global {
  namespace JSX {
    type Element = XmlNode

    interface ElementChildrenAttribute {
      children: {}
    }

    interface IntrinsicElements {
      // Allow any XML tag name with any props
      [tagName: string]: {
        [prop: string]: string | number | boolean | null | undefined
        children?: AnyXmlNode | AnyXmlNode[]
      }
    }
  }
}

export {}
