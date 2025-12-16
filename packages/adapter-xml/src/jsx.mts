// JSX type definitions
// This file serves as an entry point for TypeScript to include JSX types
// Users can add "@navios/adapter-xml/jsx" to their tsconfig.json "types" array
import type { AnyXmlNode, XmlNode } from './types/xml-node.mjs'

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
      } & {
        children?: AnyXmlNode | AnyXmlNode[]
      }
    }
  }
}

export {}
