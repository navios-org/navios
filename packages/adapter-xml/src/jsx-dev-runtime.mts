// Dev runtime is the same as the production runtime for XML
export { jsx, jsxs } from './runtime/create-element.mjs'
export { Fragment } from './types/xml-node.mjs'

// jsxDEV is called by development builds of React/JSX transformers
// It has additional debugging parameters that we ignore for XML
import { jsx } from './runtime/create-element.mjs'
export const jsxDEV = jsx
