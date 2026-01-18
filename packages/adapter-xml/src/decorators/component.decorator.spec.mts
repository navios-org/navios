import { Container, Registry } from '@navios/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { createElement } from '../runtime/create-element.mjs'
import { renderToXml } from '../runtime/render-to-xml.mjs'
import { ClassComponent } from '../types/xml-node.mjs'

import type { XmlComponent } from '../types/component.mjs'

import { Component, ComponentMeta, isComponentClass } from './component.decorator.mjs'

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

  it('should allow custom registry', () => {
    const customRegistry = new Registry()

    @Component({ registry: customRegistry })
    class RegistryComponent implements XmlComponent {
      render() {
        return createElement('custom', null)
      }
    }

    expect(isComponentClass(RegistryComponent)).toBe(true)
    // The component should have a token stored
    // @ts-expect-error - Checking InjectableTokenMeta
    const token = RegistryComponent[Symbol.for('InjectableTokenMeta')]
    expect(token).toBeDefined()
    // And that token should be registered in the custom registry
    expect(customRegistry.has(token)).toBe(true)
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
  it('should render basic class component', async () => {
    @Component()
    class SimpleComponent implements XmlComponent {
      render() {
        return createElement('simple', null, 'content')
      }
    }

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(SimpleComponent, null)
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<simple>content</simple>')
    } finally {
      await requestContainer.endRequest()
    }
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

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(Greeting, { name: 'World' })
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<greeting>Hello, World!</greeting>')
    } finally {
      await requestContainer.endRequest()
    }
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

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(Outer, null)
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<outer><inner>nested</inner></outer>')
    } finally {
      await requestContainer.endRequest()
    }
  })

  it('should render async class component', async () => {
    @Component()
    class AsyncComponent implements XmlComponent {
      async render() {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return createElement('async', null, 'loaded')
      }
    }

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(AsyncComponent, null)
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<async>loaded</async>')
    } finally {
      await requestContainer.endRequest()
    }
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

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      // Valid props
      const validNode = createElement(StrictComponent, { count: 5 })
      const xml = await renderToXml(validNode, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<count>5</count>')

      // Invalid props - negative number
      const invalidNode = createElement(StrictComponent, { count: -1 })
      await expect(renderToXml(invalidNode, { declaration: false, container })).rejects.toThrow()
    } finally {
      await requestContainer.endRequest()
    }
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

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(
        'page',
        null,
        createElement(Header, { title: 'Welcome' }),
        createElement(Footer, null),
      )
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<page><header>Welcome</header><footer>Copyright 2025</footer></page>')
    } finally {
      await requestContainer.endRequest()
    }
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

    const container = new Container()
    const requestContainer = container.beginRequest('test-request')
    try {
      const node = createElement(
        Wrapper,
        null,
        createElement('child1', null),
        createElement('child2', null),
      )
      const xml = await renderToXml(node, {
        declaration: false,
        container: requestContainer,
      })
      expect(xml).toBe('<wrapper><child1/><child2/></wrapper>')
    } finally {
      await requestContainer.endRequest()
    }
  })
})
