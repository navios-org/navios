import { CData, Component, defineTag, renderToXml, xml, xmlPlugin } from '@navios/adapter-xml'
import { builder } from '@navios/builder'
import {
  Controller,
  handler,
  inject,
  Injectable,
  Module,
  NaviosFactory,
  RequestValue,
} from '@navios/core'
import { defineInMemoryEnvironment } from '@navios/core/testing'
import { z } from 'zod'

import type { XmlComponent } from '@navios/adapter-xml'
import type { RequestContext } from '@navios/core'

// ----------------------------------------------------------------------------
// Typed tags. The schema (any Standard Schema) is checked when the tag renders.
// ----------------------------------------------------------------------------

const Rss = defineTag('rss', z.object({ version: z.string() }))
const Channel = defineTag('channel')
const Title = defineTag('title')
const Link = defineTag('link')
const Description = defineTag('description')
const Language = defineTag('language')
const PubDate = defineTag('pubDate')
const Item = defineTag('item')
const Guid = defineTag('guid', z.object({ isPermaLink: z.boolean().optional() }))
const AtomLink = defineTag(
  'atom:link',
  z.object({ href: z.string(), rel: z.string(), type: z.string().optional() }),
)

// ----------------------------------------------------------------------------
// Services and per-request data
// ----------------------------------------------------------------------------

interface PostData {
  id: number
  postTitle: string
  postLink: string
  content: string
  date: Date
}

@Injectable()
class PostService {
  async latest(): Promise<PostData[]> {
    return [
      {
        id: 1,
        postTitle: 'Getting Started with adapter-xml',
        postLink: 'https://example.com/posts/getting-started',
        content: '<p>This is <strong>HTML</strong> content that will be wrapped in CDATA.</p>',
        date: new Date('2024-01-15'),
      },
      {
        id: 2,
        postTitle: 'Advanced JSX for XML Generation',
        postLink: 'https://example.com/posts/advanced-jsx',
        content: '<p>Learn how to use <em>async components</em> and <code>typed tags</code>.</p>',
        date: new Date('2024-01-20'),
      },
    ]
  }
}

/** Computed at most once per request, on first `ctx.get(Locale)`. */
@RequestValue()
class Locale {
  resolve(ctx: RequestContext) {
    return ctx.headers.get('accept-language') ?? 'en-us'
  }
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

const DescriptionSchema = z.object({ content: z.string() })

/** Class component with validated props. */
@Component({ schema: DescriptionSchema })
class PostDescription implements XmlComponent {
  constructor(private readonly props: z.output<typeof DescriptionSchema>) {}

  render() {
    return (
      <Description>
        <CData>{this.props.content}</CData>
      </Description>
    )
  }
}

/** Class component: a singleton through inject(), request data through ctx. */
@Component()
class LatestPosts implements XmlComponent {
  private readonly posts = inject(PostService)

  async render() {
    const posts = await this.posts.latest()
    return (
      <>
        {posts.map((post) => (
          <Post post={post} />
        ))}
      </>
    )
  }
}

/** Async function component. */
async function Post({ post }: { post: PostData }) {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return (
    <Item>
      <Title>{post.postTitle}</Title>
      <Link>{post.postLink}</Link>
      <PostDescription content={post.content} />
      <PubDate>{post.date.toUTCString()}</PubDate>
      <Guid isPermaLink={true}>{post.postLink}</Guid>
    </Item>
  )
}

/** Function component that reads the request: the second argument is the context. */
function FeedLanguage(_props: {}, ctx: RequestContext) {
  return <Language>{ctx.get(Locale)}</Language>
}

function RssFeed({ feedTitle, feedLink }: { feedTitle: string; feedLink: string }) {
  return (
    <Rss version="2.0">
      <Channel>
        <Title>{feedTitle}</Title>
        <Link>{feedLink}</Link>
        <FeedLanguage />
        <AtomLink href={`${feedLink}/feed.xml`} rel="self" type="application/rss+xml" />
        <LatestPosts />
      </Channel>
    </Rss>
  )
}

// ----------------------------------------------------------------------------
// Application
// ----------------------------------------------------------------------------

const api = builder()

const getFeed = api.declareEndpoint({
  method: 'GET',
  url: '/feed.xml',
  querySchema: z.object({ pretty: z.enum(['true', 'false']).optional() }),
  response: 'text',
})

@Controller()
class FeedController {
  feed = handler(getFeed, ({ params }) =>
    xml(<RssFeed feedTitle="My Awesome Blog" feedLink="https://example.com" />, {
      contentType: 'application/rss+xml',
      pretty: params.pretty === 'true',
    }),
  )
}

@Module({ controllers: [FeedController] })
class AppModule {}

async function main() {
  // The in-memory adapter keeps the example self-contained. With a real
  // server only this line changes: `adapter: defineFastifyEnvironment()` or
  // `defineBunEnvironment()`, followed by `await app.listen({ port: 3000 })`.
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineInMemoryEnvironment(),
    plugins: [xmlPlugin()],
    logger: false,
  })
  await app.init()

  console.log('=== GET /feed.xml ===')
  const compact = await app.inject({ method: 'GET', url: '/feed.xml' })
  console.log(compact.status, compact.headers['content-type'])
  console.log(compact.text)

  console.log('\n=== GET /feed.xml?pretty=true (accept-language: uk) ===')
  const pretty = await app.inject({
    method: 'GET',
    url: '/feed.xml?pretty=true',
    headers: { 'accept-language': 'uk' },
  })
  console.log(pretty.text)

  // Outside a request: render a tree directly. Class components need a
  // container; components that read the request context cannot be used here.
  console.log('=== renderToXml ===')
  console.log(
    await renderToXml(<PostDescription content="<b>standalone</b>" />, {
      container: app.container,
      declaration: false,
    }),
  )

  await app.close()
}

main().catch(console.error)
