import type { AnyXmlNode } from './xml-node.mjs'

/**
 * Base interface for class-based XML components.
 *
 * Class components are classes decorated with `@Component` that can use
 * dependency injection and return JSX-based XML nodes. The `render()` method
 * takes no arguments - props are received via the constructor.
 *
 * @example
 * ```tsx
 * @Component()
 * class LatestPostsComponent implements XmlComponent {
 *   private readonly postService = inject(PostService)
 *
 *   async render() {
 *     const posts = await this.postService.getLatestPosts()
 *     return (
 *       <>
 *         {posts.map(post => <item>...</item>)}
 *       </>
 *     )
 *   }
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With props
 * @Component({ schema: MyPropsSchema })
 * class MyComponent implements XmlComponent {
 *   constructor(private props: z.output<typeof MyPropsSchema>) {}
 *
 *   render() {
 *     return <div>{this.props.content}</div>
 *   }
 * }
 * ```
 */
export interface XmlComponent {
  /**
   * Renders the component to an XML node.
   *
   * This method is called when the component is rendered. It can return
   * a synchronous XML node or a Promise that resolves to an XML node.
   *
   * @returns An XML node or a Promise that resolves to an XML node.
   */
  render(): AnyXmlNode | Promise<AnyXmlNode>
}

/**
 * Type for class component constructors.
 *
 * This type represents a class constructor that creates instances of
 * `XmlComponent`. Used for type checking and dependency injection.
 */
export interface ComponentClass {
  new (...args: any[]): XmlComponent
}
