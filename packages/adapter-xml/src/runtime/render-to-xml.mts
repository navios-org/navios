import type { Container, RequestContext, ScopedContainer } from '@navios/core'

import {
  AsyncComponent,
  CDataSymbol,
  ClassComponent,
  Fragment,
  FunctionComponentSymbol,
  RawXmlSymbol,
} from '../types/xml-node.mjs'

import type { XmlComponent } from '../types/component.mjs'
import type {
  AnyXmlNode,
  AsyncXmlNode,
  CDataNode,
  ClassComponentNode,
  FunctionComponentNode,
  RawXmlNode,
  XmlNode,
  XmlRenderable,
} from '../types/xml-node.mjs'

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
 * Error thrown when attempting to render a class component without a container.
 *
 * Class components are built by a dependency injection container. Inside an
 * application `xmlPlugin()` supplies it; a direct `renderToXml` call has to
 * pass one.
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
 * Error thrown when a component uses the request context while the tree is
 * rendered outside a request.
 */
export class MissingContextError extends Error {
  constructor(property: string) {
    super(
      `[@navios/adapter-xml] A component read ctx.${property}, but the tree is rendered without a ` +
        `request context. Return the tree from a handler with xml(), or pass the context to ` +
        `renderToXml options: renderToXml(node, { ctx })`,
    )
    this.name = 'MissingContextError'
  }
}

/** Stands in for the request context when there is none. */
const NO_CONTEXT = new Proxy(Object.freeze({}), {
  get(_target, property) {
    // Promise resolution and inspection probe for these; they are not reads
    // of the context.
    if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
      return undefined
    }
    throw new MissingContextError(property)
  },
}) as RequestContext

interface RenderEnvironment {
  container: Container | ScopedContainer | undefined
  ctx: RequestContext
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

/**
 * Runs components until a node that can be written is left: text, a number,
 * CDATA, raw XML, an element or a fragment.
 */
async function resolveNode(node: AnyXmlNode, env: RenderEnvironment): Promise<AnyXmlNode> {
  let current = node
  for (;;) {
    if (current == null || typeof current !== 'object') {
      return current
    }
    if (isFunctionComponentNode(current)) {
      // Function components are called here, not when the JSX is evaluated,
      // so that they receive the request context.
      current = (await current.component(current.props, env.ctx)) as AnyXmlNode
    } else if (isClassComponentNode(current)) {
      // Class components: a new instance from the container, with the props
      // as constructor argument (validated when the component declares a
      // schema).
      if (!env.container) {
        throw new MissingContainerError(current.componentClass.name)
      }
      const instance = (await env.container.get(
        current.componentClass as any,
        current.props,
      )) as XmlComponent
      current = (await instance.render(env.ctx)) as AnyXmlNode
    } else if (isAsyncNode(current)) {
      current = await current.promise
    } else {
      return current
    }
  }
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
  if (isCDataNode(node)) {
    return renderCData(node.content)
  }

  // Handle Raw XML nodes - no escaping
  if (isRawXmlNode(node)) {
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
      isCDataNode(c) ||
      isRawXmlNode(c),
  )
  if (hasOnlySimpleContent) {
    return `${prefix}<${type}${attrs}>${childContent}</${type}>${newline}`
  }

  return `${prefix}<${type}${attrs}>${newline}${childContent}${prefix}</${type}>${newline}`
}

function isFunctionComponentNode(node: unknown): node is FunctionComponentNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    'type' in node &&
    node.type === FunctionComponentSymbol
  )
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
