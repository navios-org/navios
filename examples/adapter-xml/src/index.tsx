import {
  CData,
  Component,
  defineTag,
  renderToXml,
  XmlComponent,
} from '@navios/adapter-xml'
import { Container, inject, Injectable } from '@navios/di'
import { z } from 'zod'

// Define typed tags with Zod validation
const Rss = defineTag(
  'rss',
  z.object({
    version: z.string(),
  }),
)

const Channel = defineTag('channel')
const Title = defineTag('title')
const Link = defineTag('link')
const Description = defineTag('description')
const Language = defineTag('language')
const PubDate = defineTag('pubDate')
const Item = defineTag('item')
const Guid = defineTag(
  'guid',
  z.object({
    isPermaLink: z.boolean().optional(),
  }),
)
const AdditionalContent = defineTag('additionalContent')

// Namespaced tag example
const AtomLink = defineTag(
  'atom:link',
  z.object({
    href: z.string(),
    rel: z.string(),
    type: z.string().optional(),
  }),
)

// Post data interface
interface PostData {
  id: number
  postTitle: string
  postLink: string
  content: string
  date: Date
}

@Injectable()
class PostService {
  async getSomething() {
    return 'something'
  }
}

@Component()
class PostComponent implements XmlComponent {
  private readonly postService = inject(PostService)

  async render() {
    return (
      <AdditionalContent>
        {await this.postService.getSomething()}
      </AdditionalContent>
    )
  }
}

const DescriptionSchema = z.object({
  content: z.string(),
})

@Component({ schema: DescriptionSchema })
class DescriptionComponent implements XmlComponent {
  constructor(private props: z.output<typeof DescriptionSchema>) {}

  async render() {
    return (
      <Description>
        <CData>{this.props.content}</CData>
      </Description>
    )
  }
}
// Async component example - simulates fetching data
async function Post({ post }: { post: PostData }) {
  // Simulate fetching additional data
  await new Promise((resolve) => setTimeout(resolve, 10))

  return (
    <Item>
      <Title>{post.postTitle}</Title>
      <Link>{post.postLink}</Link>
      <DescriptionComponent content={post.content} />
      <PubDate>{post.date.toUTCString()}</PubDate>
      <Guid isPermaLink={true}>{post.postLink}</Guid>
      <PostComponent />
    </Item>
  )
}

// Component that renders the full RSS feed
interface FeedProps {
  feedTitle: string
  feedLink: string
  feedDescription: string
  posts: PostData[]
}

function RssFeed({ feedTitle, feedLink, feedDescription, posts }: FeedProps) {
  return (
    <Rss version="2.0">
      <Channel>
        <Title>{feedTitle}</Title>
        <Link>{feedLink}</Link>
        <Description>{feedDescription}</Description>
        <Language>en-us</Language>
        <AtomLink
          href={`${feedLink}/feed.xml`}
          rel="self"
          type="application/rss+xml"
        />
        {posts.map((post) => (
          <Post post={post} />
        ))}
      </Channel>
    </Rss>
  )
}

// Main execution
async function main() {
  const posts: PostData[] = [
    {
      id: 1,
      postTitle: 'Getting Started with adapter-xml',
      postLink: 'https://example.com/posts/getting-started',
      content:
        '<p>This is a <strong>HTML</strong> content example that will be wrapped in CDATA.</p>',
      date: new Date('2024-01-15'),
    },
    {
      id: 2,
      postTitle: 'Advanced JSX for XML Generation',
      postLink: 'https://example.com/posts/advanced-jsx',
      content:
        '<p>Learn how to use <em>async components</em> and <code>typed tags</code>.</p>',
      date: new Date('2024-01-20'),
    },
  ]

  const feed = (
    <RssFeed
      feedTitle="My Awesome Blog"
      feedLink="https://example.com"
      feedDescription="A blog about software development"
      posts={posts}
    />
  )
  const container = new Container()
  container.beginRequest('request-1')

  // Render compact XML
  console.log('=== Compact XML ===')
  const compactXml = await renderToXml(feed, { container })
  console.log(compactXml)

  console.log('\n=== Pretty XML ===')
  const prettyXml = await renderToXml(feed, { pretty: true, container })
  console.log(prettyXml)
}

main().catch(console.error)
