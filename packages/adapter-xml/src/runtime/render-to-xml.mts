import type { Container, ScopedContainer } from '@navios/core'

import {
  AsyncComponent,
  CDataSymbol,
  ClassComponent,
  Fragment,
  RawXmlSymbol,
} from '../types/xml-node.mjs'

import type { XmlComponent } from '../types/component.mjs'
import type {
  AnyXmlNode,
  AsyncXmlNode,
  CDataNode,
  ClassComponentNode,
  RawXmlNode,
} from '../types/xml-node.mjs'

/**
 * Options for rendering XML from JSX nodes.
 *
 * @example
 * ```ts
 * const xml = await renderToXml(<rss version="2.0">...</rss>, {
 *   declaration: true,
 *   encoding: 'UTF-8',
 *   pretty: true,
 *   container: myContainer, // Required for class components
 * })
 * ```
 */
export interface RenderOptions {
  /** Include XML declaration (<?xml version="1.0"?>) - defaults to true */
  declaration?: boolean
  /** XML encoding, defaults to 'UTF-8' */
  encoding?: string
  /** Pretty print with indentation */
  pretty?: boolean
  /**
   * DI container for resolving class components.
   * Required if the tree contains any class components.
   */
  container?: Container | ScopedContainer
}

/**
 * Error thrown when attempting to render a class component without a container.
 *
 * Class components require a dependency injection container to be instantiated.
 * This error is thrown when `renderToXml` is called with a class component in
 * the tree but no container is provided in the options.
 *
 * @example
 * ```ts
 * try {
 *   await renderToXml(<MyClassComponent />)
 * } catch (error) {
 *   if (error instanceof MissingContainerError) {
 *     // Provide a container
 *     await renderToXml(<MyClassComponent />, { container })
 *   }
 * }
 * ```
 */
export class MissingContainerError extends Error {
  constructor(componentName: string) {
    super(
      `[@navios/adapter-xml] Cannot render class component "${componentName}" without a container. ` +
        `Pass a container to renderToXml options: renderToXml(node, { container })`,
    )
    this.name = 'MissingContainerError'
  }
}

/**
 * Renders a JSX XML node tree to an XML string.
 *
 * This function handles:
 * - Regular XML nodes (tags with props and children)
 * - Async components (resolves promises in parallel)
 * - Class components (resolves via DI container)
 * - CDATA sections
 * - Raw XML content
 * - Fragments
 * - Text content with proper escaping
 *
 * @param node - The root XML node (JSX element) to render.
 * @param options - Rendering options including declaration, encoding, pretty printing, and container.
 * @returns A promise that resolves to the XML string.
 *
 * @throws {MissingContainerError} If the tree contains class components but no container is provided.
 *
 * @example
 * ```ts
 * // Simple rendering
 * const xml = await renderToXml(<rss version="2.0"><channel>...</channel></rss>)
 *
 * // With options
 * const xml = await renderToXml(<feed>...</feed>, {
 *   declaration: true,
 *   encoding: 'UTF-8',
 *   pretty: true,
 * })
 *
 * // With class components (requires container)
 * const container = new Container()
 * container.beginRequest('request-id')
 * const xml = await renderToXml(<MyClassComponent />, { container })
 * ```
 */
export async function renderToXml(node: AnyXmlNode, options: RenderOptions = {}): Promise<string> {
  const { declaration = true, encoding = 'UTF-8', pretty = false, container } = options

  let xml = ''
  if (declaration) {
    xml += `<?xml version="1.0" encoding="${encoding}"?>`
    if (pretty) xml += '\n'
  }

  xml += await renderNode(node, pretty ? 0 : -1, container)
  return xml
}

async function renderNode(
  node: AnyXmlNode,
  indent: number,
  container: Container | ScopedContainer | undefined,
): Promise<string> {
  if (node == null) return ''
  if (typeof node === 'string') return escapeXml(node)
  if (typeof node === 'number') return String(node)

  // Handle class components - resolve via DI container
  if (isClassComponentNode(node)) {
    if (!container) {
      throw new MissingContainerError(node.componentClass.name)
    }

    // Resolve the component instance from the container, passing props as schema args
    // This validates props via Zod schema if defined on the component
    const instance = (await container.get(node.componentClass as any, node.props)) as XmlComponent

    // Call render() - no arguments, props are already in the instance
    const result = instance.render()

    // Handle async render methods
    const resolved = result instanceof Promise ? await result : result

    // Recursively render the result
    return renderNode(resolved, indent, container)
  }

  // Handle async components - resolve the promise first
  if (isAsyncNode(node)) {
    const resolved = await node.promise
    return renderNode(resolved, indent, container)
  }

  // Handle CDATA nodes
  if (isCDataNode(node)) {
    return renderCData(node.content)
  }

  // Handle Raw XML nodes - no escaping
  if (isRawXmlNode(node)) {
    return node.content
  }

  const { type, props, children } = node

  if (type === Fragment) {
    const renderedChildren = await Promise.all(
      children.filter((c) => c != null).map((c) => renderNode(c, indent, container)),
    )
    return renderedChildren.join('')
  }

  const prefix = indent >= 0 ? '  '.repeat(indent) : ''
  const newline = indent >= 0 ? '\n' : ''

  const attrs = Object.entries(props)
    .filter(([_, v]) => v != null)
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join('')

  if (children.length === 0) {
    return `${prefix}<${type}${attrs}/>${newline}`
  }

  const childIndent = indent >= 0 ? indent + 1 : -1

  // Resolve all children (including async and class components) in parallel
  const resolvedChildren = await Promise.all(
    children.filter((c) => c != null).map((c) => renderNode(c, childIndent, container)),
  )
  const childContent = resolvedChildren.join('')

  // Check if children are simple (text, numbers, CDATA, or raw XML)
  const hasOnlySimpleContent = children.every(
    (c) => typeof c === 'string' || typeof c === 'number' || isCDataNode(c) || isRawXmlNode(c),
  )
  if (hasOnlySimpleContent) {
    return `${prefix}<${type}${attrs}>${childContent}</${type}>${newline}`
  }

  return `${prefix}<${type}${attrs}>${newline}${childContent}${prefix}</${type}>${newline}`
}

function isClassComponentNode(node: unknown): node is ClassComponentNode {
  return node !== null && typeof node === 'object' && 'type' in node && node.type === ClassComponent
}

function isAsyncNode(node: unknown): node is AsyncXmlNode {
  return node !== null && typeof node === 'object' && 'type' in node && node.type === AsyncComponent
}

function isCDataNode(node: any): node is CDataNode {
  return node && typeof node === 'object' && node.type === CDataSymbol
}

function isRawXmlNode(node: any): node is RawXmlNode {
  return node && typeof node === 'object' && node.type === RawXmlSymbol
}

/**
 * Renders content as CDATA section.
 * If content contains "]]>", splits into multiple CDATA sections.
 * The technique is to end the CDATA section before ]]>, then start a new one.
 */
function renderCData(content: string): string {
  // Handle the edge case where content contains "]]>"
  // We split on "]]>" and join with "]]]]><![CDATA[>" which effectively
  // ends the CDATA section after "]]" and starts a new one for ">"
  if (content.includes(']]>')) {
    // Replace ]]> with ]]]]><![CDATA[> which closes CDATA before > and reopens it
    const escaped = content.replace(/]]>/g, ']]]]><![CDATA[>')
    return `<![CDATA[${escaped}]]>`
  }
  return `<![CDATA[${content}]]>`
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
