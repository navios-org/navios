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
