/**
 * `@navios/adapter-xml/jsx`: the JSX types of the package as the global `JSX`
 * namespace, for a setup that does not use `jsxImportSource`:
 *
 * ```json
 * { "compilerOptions": { "types": ["@navios/adapter-xml/jsx"] } }
 * ```
 *
 * The types are the ones `@navios/adapter-xml/jsx-runtime` exports. The
 * interfaces extend them, so a project can still add to them with
 * declaration merging.
 */
import type { JSX as XmlJSX } from './jsx/jsx-namespace.mjs'

// The declaration bundler names the import `JSX` again. Inside the global
// namespace below that name would mean the namespace itself, so the members
// are aliased out here, where it still means the import.
type XmlElement = XmlJSX.Element
type XmlChild = XmlJSX.Child
type XmlBaseTagProps = XmlJSX.BaseTagProps
type XmlElementChildrenAttribute = XmlJSX.ElementChildrenAttribute
type XmlIntrinsicElements = XmlJSX.IntrinsicElements
type XmlElementClass = XmlJSX.ElementClass
type XmlIntrinsicAttributes = XmlJSX.IntrinsicAttributes

declare global {
  namespace JSX {
    type Element = XmlElement
    type Child = XmlChild
    type BaseTagProps = XmlBaseTagProps
    interface ElementChildrenAttribute extends XmlElementChildrenAttribute {}
    interface IntrinsicElements extends XmlIntrinsicElements {}
    interface ElementClass extends XmlElementClass {}
    interface IntrinsicAttributes extends XmlIntrinsicAttributes {}
  }
}
