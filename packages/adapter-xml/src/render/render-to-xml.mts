import type { Container, RequestContext, ScopedContainer } from '@navios/server'

import { CDataSymbol } from '../nodes/cdata.mjs'
import { RawXmlSymbol } from '../nodes/raw-xml.mjs'
import { Fragment, isNodeOfType } from '../nodes/xml-node.mjs'

import type { AnyXmlNode, XmlNode, XmlRenderable } from '../nodes/xml-node.mjs'

import { escapeAttr, escapeXml, renderCData } from './escape.mjs'
import { NO_CONTEXT } from './render-environment.mjs'
import { resolveNode } from './resolve-node.mjs'

import type { RenderEnvironment } from './render-environment.mjs'

/**
 * Options for rendering XML from JSX nodes.
 *
 * @example
 * ```ts
 * const xml = await renderToXml(<rss version="2.0">...</rss>, {
 *   pretty: true,
 *   container, // needed when the tree contains class components
 *   ctx, // needed when a component reads the request context
 * })
 * ```
 */
export interface RenderOptions {
  /** Include XML declaration (<?xml version="1.0"?>) - defaults to true */
  declaration?: boolean
  /** Encoding named in the XML declaration, defaults to 'UTF-8' */
  encoding?: string
  /** Pretty print with indentation */
  pretty?: boolean
  /**
   * DI container that builds class components.
   * Required if the tree contains any class components.
   */
  container?: Container | ScopedContainer
  /**
   * The request the document is rendered for. It is passed to function
   * components as their second argument and to `render(ctx)` of class
   * components.
   */
  ctx?: RequestContext
}

/**
 * Renders a JSX XML node tree to an XML string.
 *
 * This function handles:
 * - Regular XML nodes (tags with props and children)
 * - Function components, synchronous or asynchronous (siblings are resolved in parallel)
 * - Class components (built by the DI container)
 * - CDATA sections
 * - Raw XML content
 * - Fragments
 * - Text content with proper escaping
 *
 * @param node - The root XML node (JSX element) to render.
 * @param options - Rendering options including declaration, encoding, pretty printing, container and request context.
 * @returns A promise that resolves to the XML string.
 *
 * @throws {MissingContainerError} If the tree contains class components but no container is provided.
 * @throws {MissingContextError} If a component uses the request context but none is provided.
 *
 * @example
 * ```ts
 * // Simple rendering
 * const xml = await renderToXml(<rss version="2.0"><channel>...</channel></rss>)
 *
 * // With class components (requires container)
 * const container = new Container()
 * const xml = await renderToXml(<MyClassComponent />, { container })
 * ```
 */
export async function renderToXml(
  node: XmlRenderable,
  options: RenderOptions = {},
): Promise<string> {
  const { declaration = true, encoding = 'UTF-8', pretty = false, container, ctx } = options

  let xml = ''
  if (declaration) {
    xml += `<?xml version="1.0" encoding="${encoding}"?>`
    if (pretty) xml += '\n'
  }

  xml += await renderNode(node as AnyXmlNode, pretty ? 0 : -1, {
    container,
    ctx: ctx ?? NO_CONTEXT,
  })
  return xml
}

async function renderNode(
  unresolved: AnyXmlNode,
  indent: number,
  env: RenderEnvironment,
): Promise<string> {
  const node = await resolveNode(unresolved, env)
  if (node == null) return ''
  if (typeof node === 'string') return escapeXml(node)
  if (typeof node === 'number') return String(node)

  // Handle CDATA nodes
  if (isNodeOfType(node, CDataSymbol)) {
    return renderCData(node.content)
  }

  // Handle Raw XML nodes - no escaping
  if (isNodeOfType(node, RawXmlSymbol)) {
    return node.content
  }

  // Components were resolved above, so everything left is one of these.
  const { type, props, children: unresolvedChildren } = node as XmlNode

  if (type === Fragment) {
    const renderedChildren = await Promise.all(
      unresolvedChildren.filter((c) => c != null).map((c) => renderNode(c, indent, env)),
    )
    return renderedChildren.join('')
  }

  const prefix = indent >= 0 ? '  '.repeat(indent) : ''
  const newline = indent >= 0 ? '\n' : ''

  const attrs = Object.entries(props)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join('')

  if (unresolvedChildren.length === 0) {
    return `${prefix}<${type}${attrs}/>${newline}`
  }

  // Run the components among the children, in parallel, before deciding how
  // to lay the element out: a component that yields text is text.
  const children = await Promise.all(
    unresolvedChildren.filter((c) => c != null).map((c) => resolveNode(c, env)),
  )

  const childIndent = indent >= 0 ? indent + 1 : -1
  const renderedChildren = await Promise.all(children.map((c) => renderNode(c, childIndent, env)))
  const childContent = renderedChildren.join('')

  // Check if children are simple (text, numbers, CDATA, or raw XML)
  const hasOnlySimpleContent = children.every(
    (c) =>
      c == null ||
      typeof c === 'string' ||
      typeof c === 'number' ||
      isNodeOfType(c, CDataSymbol) ||
      isNodeOfType(c, RawXmlSymbol),
  )
  if (hasOnlySimpleContent) {
    return `${prefix}<${type}${attrs}>${childContent}</${type}>${newline}`
  }

  return `${prefix}<${type}${attrs}>${newline}${childContent}${prefix}</${type}>${newline}`
}
