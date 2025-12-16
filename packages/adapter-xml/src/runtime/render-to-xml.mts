import type {
  AnyXmlNode,
  AsyncXmlNode,
  CDataNode,
  RawXmlNode,
} from '../types/xml-node.mjs'

import {
  AsyncComponent,
  CDataSymbol,
  Fragment,
  RawXmlSymbol,
} from '../types/xml-node.mjs'

export interface RenderOptions {
  declaration?: boolean
  encoding?: string
  pretty?: boolean
}

export async function renderToXml(
  node: AnyXmlNode,
  options: RenderOptions = {},
): Promise<string> {
  const { declaration = true, encoding = 'UTF-8', pretty = false } = options

  let xml = ''
  if (declaration) {
    xml += `<?xml version="1.0" encoding="${encoding}"?>`
    if (pretty) xml += '\n'
  }

  xml += await renderNode(node, pretty ? 0 : -1)
  return xml
}

async function renderNode(node: AnyXmlNode, indent: number): Promise<string> {
  if (node == null) return ''
  if (typeof node === 'string') return escapeXml(node)
  if (typeof node === 'number') return String(node)

  // Handle async components - resolve the promise first
  if (isAsyncNode(node)) {
    const resolved = await node.promise
    return renderNode(resolved, indent)
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
      children.filter((c) => c != null).map((c) => renderNode(c, indent)),
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

  // Resolve all children (including async ones) in parallel
  const resolvedChildren = await Promise.all(
    children.filter((c) => c != null).map((c) => renderNode(c, childIndent)),
  )
  const childContent = resolvedChildren.join('')

  // Check if children are simple (text, numbers, CDATA, or raw XML)
  const hasOnlySimpleContent = children.every(
    (c) =>
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

function isAsyncNode(node: any): node is AsyncXmlNode {
  return node && typeof node === 'object' && node.type === AsyncComponent
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
