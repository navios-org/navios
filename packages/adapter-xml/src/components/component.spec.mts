import { Container, inject, Injectable, InjectableScope } from '@navios/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { RequestContext } from '@navios/server'

import { createElement } from '../jsx/create-element.mjs'
import { ClassComponent } from '../nodes/xml-node.mjs'
import { renderToXml } from '../render/render-to-xml.mjs'

import { Component, ComponentMeta, isComponentClass } from './component.mjs'

import type { XmlComponent } from './xml-component.mjs'

describe('@Component decorator', () => {
  it('should mark class as a component', () => {
    @Component()
    class TestComponent implements XmlComponent {
      render() {
        return createElement('test', null)
      }
    }

    expect(isComponentClass(TestComponent)).toBe(true)
    // @ts-expect-error - Checking metadata
    expect(TestComponent[ComponentMeta]).toBe(true)
  })

  it('should throw if class does not have render method', () => {
    expect(() => {
      // @ts-expect-error - Testing invalid class
      @Component()
      class InvalidComponent {
        notRender() {
          return null
        }
      }
      // Force evaluation
      return InvalidComponent
    }).toThrow('must implement render() method')
  })

  it('should create ClassComponentNode when used in createElement', () => {
    @Component()
    class MyComponent implements XmlComponent {
      render() {
        return createElement('content', null, 'Hello')
      }
    }

    const node = createElement(MyComponent, null)

    expect(node).toEqual({
      type: ClassComponent,
      componentClass: MyComponent,
      props: { children: [] },
    })
  })

  it('should pass props to ClassComponentNode', () => {
    const PropsSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
    })

    @Component({ schema: PropsSchema })
    class PropsComponent implements XmlComponent {
      constructor(private props: z.output<typeof PropsSchema>) {}

      render() {
        return createElement('user', null, this.props.name)
      }
    }

    const node = createElement(PropsComponent, { name: 'John', age: 30 })

    expect(node).toEqual({
      type: ClassComponent,
      componentClass: PropsComponent,
      props: { name: 'John', age: 30, children: [] },
    })
  })

  it('should register a class without decorator syntax', () => {
    class PlainComponent implements XmlComponent {
      render() {
        return createElement('plain', null)
      }
    }

    expect(Component()(PlainComponent)).toBe(PlainComponent)
    expect(isComponentClass(PlainComponent)).toBe(true)
  })

  it('should reject a target that is not a class', () => {
    expect(() => Component()({} as any)).toThrow('can only be used on classes')
  })
})

describe('isComponentClass', () => {
  it('should return true for decorated classes', () => {
    @Component()
    class DecoratedComponent implements XmlComponent {
      render() {
        return createElement('test', null)
      }
    }

    expect(isComponentClass(DecoratedComponent)).toBe(true)
  })

  it('should return false for regular functions', () => {
    function regularFunction() {
      return createElement('test', null)
    }

    expect(isComponentClass(regularFunction)).toBe(false)
  })

  it('should return false for regular classes', () => {
    class RegularClass {
      render() {
        return createElement('test', null)
      }
    }

    expect(isComponentClass(RegularClass)).toBe(false)
  })

  it('should return false for non-functions', () => {
    expect(isComponentClass('string')).toBe(false)
    expect(isComponentClass(123)).toBe(false)
    expect(isComponentClass(null)).toBe(false)
    expect(isComponentClass(undefined)).toBe(false)
    expect(isComponentClass({})).toBe(false)
  })
})

describe('class component rendering', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should render basic class component', async () => {
    @Component()
    class SimpleComponent implements XmlComponent {
      render() {
        return createElement('simple', null, 'content')
      }
    }

    const node = createElement(SimpleComponent, null)
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<simple>content</simple>')
  })

  it('should render class component with props', async () => {
    const GreetingSchema = z.object({
      name: z.string(),
    })

    @Component({ schema: GreetingSchema })
    class Greeting implements XmlComponent {
      constructor(private props: z.output<typeof GreetingSchema>) {}

      render() {
        return createElement('greeting', null, `Hello, ${this.props.name}!`)
      }
    }

    const node = createElement(Greeting, { name: 'World' })
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<greeting>Hello, World!</greeting>')
  })

  it('should render nested class components', async () => {
    @Component()
    class Inner implements XmlComponent {
      render() {
        return createElement('inner', null, 'nested')
      }
    }

    @Component()
    class Outer implements XmlComponent {
      render() {
        return createElement('outer', null, createElement(Inner, null))
      }
    }

    const node = createElement(Outer, null)
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<outer><inner>nested</inner></outer>')
  })

  it('should render async class component', async () => {
    @Component()
    class AsyncComponent implements XmlComponent {
      async render() {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return createElement('async', null, 'loaded')
      }
    }

    const node = createElement(AsyncComponent, null)
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<async>loaded</async>')
  })

  it('should throw MissingContainerError when container not provided', async () => {
    @Component()
    class RequiresContainer implements XmlComponent {
      render() {
        return createElement('test', null)
      }
    }

    const node = createElement(RequiresContainer, null)

    await expect(renderToXml(node, { declaration: false })).rejects.toThrow(
      'Cannot render class component "RequiresContainer" without a container',
    )
  })

  it('should validate props with Zod schema', async () => {
    const StrictSchema = z.object({
      count: z.number().min(0),
    })

    @Component({ schema: StrictSchema })
    class StrictComponent implements XmlComponent {
      constructor(private props: z.output<typeof StrictSchema>) {}

      render() {
        return createElement('count', null, String(this.props.count))
      }
    }

    // Valid props
    const validNode = createElement(StrictComponent, { count: 5 })
    const xml = await renderToXml(validNode, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<count>5</count>')

    // Invalid props - negative number
    const invalidNode = createElement(StrictComponent, { count: -1 })
    await expect(renderToXml(invalidNode, { declaration: false, container })).rejects.toThrow()
  })

  it('should mix functional and class components', async () => {
    function Header({ title }: { title: string }) {
      return createElement('header', null, title)
    }

    @Component()
    class Footer implements XmlComponent {
      render() {
        return createElement('footer', null, 'Copyright 2025')
      }
    }

    const node = createElement(
      'page',
      null,
      createElement(Header, { title: 'Welcome' }),
      createElement(Footer, null),
    )
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<page><header>Welcome</header><footer>Copyright 2025</footer></page>')
  })

  it('should handle children in class components', async () => {
    const WrapperSchema = z.object({
      children: z.array(z.any()).optional(),
    })

    @Component({ schema: WrapperSchema })
    class Wrapper implements XmlComponent {
      constructor(private props: z.output<typeof WrapperSchema>) {}

      render() {
        return createElement('wrapper', null, ...(this.props.children ?? []))
      }
    }

    const node = createElement(
      Wrapper,
      null,
      createElement('child1', null),
      createElement('child2', null),
    )
    const xml = await renderToXml(node, {
      declaration: false,
      container,
    })
    expect(xml).toBe('<wrapper><child1/><child2/></wrapper>')
  })

  it('should pass the request context to render()', async () => {
    @Component()
    class Path implements XmlComponent {
      render(ctx: RequestContext) {
        return createElement('path', null, ctx.path)
      }
    }

    const ctx = { path: '/feed.xml' } as RequestContext
    const xml = await renderToXml(createElement(Path, null), {
      declaration: false,
      container,
      ctx,
    })

    expect(xml).toBe('<path>/feed.xml</path>')
  })

  it('should throw MissingContextError when render() uses a context that was not given', async () => {
    @Component()
    class NeedsContext implements XmlComponent {
      render(ctx: RequestContext) {
        return createElement('path', null, ctx.path)
      }
    }

    await expect(
      renderToXml(createElement(NeedsContext, null), { declaration: false, container }),
    ).rejects.toThrow(
      'A component read ctx.path, but the tree is rendered without a request context',
    )
  })

  it('should inject singletons into a component', async () => {
    @Injectable()
    class TitleService {
      title() {
        return 'From a service'
      }
    }

    @Component()
    class Title implements XmlComponent {
      private readonly titles = inject(TitleService)

      render() {
        return createElement('title', null, this.titles.title())
      }
    }

    const xml = await renderToXml(createElement(Title, null), { declaration: false, container })

    expect(xml).toBe('<title>From a service</title>')
  })

  it('should refuse to inject a request-scoped service into a component', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    @Component()
    class Wrong implements XmlComponent {
      readonly service = inject(PerRequest)

      render() {
        return createElement('wrong', null)
      }
    }

    await expect(
      renderToXml(createElement(Wrong, null), { declaration: false, container }),
    ).rejects.toThrow(/Scope mismatch/)
  })

  it('should build a new instance for every occurrence', async () => {
    const instances = new Set<unknown>()

    @Component()
    class Counted implements XmlComponent {
      constructor(private readonly props: { label: string }) {
        instances.add(this)
      }

      render() {
        return createElement('counted', null, this.props.label)
      }
    }

    const tree = () =>
      createElement(
        'root',
        null,
        createElement(Counted, { label: 'a' }),
        createElement(Counted, { label: 'a' }),
      )

    expect(await renderToXml(tree(), { declaration: false, container })).toBe(
      '<root><counted>a</counted><counted>a</counted></root>',
    )
    await renderToXml(tree(), { declaration: false, container })

    expect(instances.size).toBe(4)
  })
})
