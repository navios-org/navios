// Dev runtime is the same as the production runtime for XML
export { jsx, jsxs } from './jsx/create-element.mjs'
export { Fragment } from './nodes/xml-node.mjs'
export type { JSX } from './jsx/jsx-namespace.mjs'

// jsxDEV is called by development builds of React/JSX transformers
// It has additional debugging parameters that we ignore for XML
import { jsx } from './jsx/create-element.mjs'
export const jsxDEV = jsx
