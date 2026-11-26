// The development runtime of XML is the production one. `jsxDEV` receives
// extra debugging arguments, which `jsx` ignores.
export * from './jsx-runtime.mjs'
export { jsx as jsxDEV } from './jsx-runtime.mjs'
