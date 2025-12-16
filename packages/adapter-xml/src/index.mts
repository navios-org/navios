// Types
export type {
  XmlNode,
  AsyncXmlNode,
  CDataNode,
  RawXmlNode,
  ClassComponentNode,
  AnyXmlNode,
  BaseXmlStreamConfig,
  XmlComponent,
  ComponentClass,
} from './types/index.mjs'

export {
  Fragment,
  AsyncComponent,
  CDataSymbol,
  RawXmlSymbol,
  ClassComponent,
} from './types/index.mjs'

// Runtime
export { createElement, CData, DangerouslyInsertRawXml, renderToXml, MissingContainerError } from './runtime/index.mjs'
export type { RenderOptions } from './runtime/index.mjs'

// Tags
export { defineTag } from './tags/index.mjs'
export type { TagComponent } from './tags/index.mjs'

// Decorators
export { XmlStream, Component, isComponentClass } from './decorators/index.mjs'
export type { XmlStreamParams } from './decorators/index.mjs'

// Handlers
export { declareXmlStream } from './handlers/index.mjs'

// Adapters
export { XmlStreamAdapterService } from './adapters/index.mjs'

// Environment
export { defineXmlEnvironment } from './define-environment.mjs'
