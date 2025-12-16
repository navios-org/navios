import type { AnyXmlNode } from './xml-node.mjs'

/**
 * Base interface for class components.
 * The render method takes no arguments - props are received via constructor.
 */
export interface XmlComponent {
  render(): AnyXmlNode | Promise<AnyXmlNode>
}

/**
 * Type for class component constructors.
 */
export interface ComponentClass {
  new (...args: any[]): XmlComponent
}
