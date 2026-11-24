/** @jsxImportSource @navios/adapter-xml */
import { builder } from '@navios/builder'
import {
  Controller,
  createContextKey,
  handler,
  inject,
  Injectable,
  InjectableScope,
  Module,
  NotFoundException,
  RequestValue,
} from '@navios/core'
import { z } from 'zod/v4'

import type { Guard, RequestContext } from '@navios/core'

import { CData, Component, DangerouslyInsertRawXml, defineTag, xml } from '../src/index.mjs'

import type { XmlComponent } from '../src/index.mjs'

const api = builder()

// ----------------------------------------------------------------------------
// Services and per-request state
// ----------------------------------------------------------------------------

let trackerCount = 0

/** A request-scoped service: one instance per request, reached with ctx.use(). */
@Injectable({ scope: InjectableScope.Request })
export class RequestTracker {
  readonly requestId = `tracker-${++trackerCount}`
}

@Injectable()
export class DataService {
  getItems() {
    return [
      { id: '1', title: 'First Item', description: 'Description 1' },
      { id: '2', title: 'Second Item', description: 'Description 2' },
      { id: '3', title: 'Third Item', description: 'Description 3' },
    ]
  }

  getItem(id: string) {
    return this.getItems().find((item) => item.id === id)
  }
}

/** A request value: computed on first read from the request. */
@RequestValue()
export class Locale {
  resolve(ctx: RequestContext) {
    return ctx.headers.get('accept-language') ?? 'en'
  }
}

export const CurrentUser = createContextKey<{ name: string }>('CurrentUser')

@Injectable()
class UserGuard implements Guard {
  canActivate(ctx: RequestContext) {
    ctx.set(CurrentUser, { name: ctx.headers.get('x-user') ?? 'anonymous' })
    return true
  }
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

/** Class component: singleton through inject(), request data through ctx. */
@Component()
class ItemComponent implements XmlComponent {
  private readonly data = inject(DataService)

  constructor(private readonly props: { id: string }) {}

  render(ctx: RequestContext) {
    const item = this.data.getItem(this.props.id)
    if (!item) {
      return <error>Item not found</error>
    }
    return (
      <item id={item.id} requestId={ctx.use(RequestTracker).requestId}>
        <title>{item.title}</title>
        <description>{item.description}</description>
      </item>
    )
  }
}

const BadgeSchema = z.object({ count: z.number().min(0) })

@Component({ schema: BadgeSchema })
class Badge implements XmlComponent {
  constructor(private readonly props: z.output<typeof BadgeSchema>) {}

  render() {
    return <badge>{this.props.count}</badge>
  }
}

@Component()
class UserComponent implements XmlComponent {
  async render(ctx: RequestContext) {
    return <user>{ctx.get(CurrentUser).name}</user>
  }
}

@Component()
class MissingComponent implements XmlComponent {
  render(): never {
    throw new NotFoundException('No such document')
  }
}

async function AsyncData({ delay }: { delay: number }) {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return <async-data>Loaded after {delay}ms</async-data>
}

/** Function component reading per-request data. */
function LocaleTag(_props: {}, ctx: RequestContext) {
  return <locale>{ctx.get(Locale)}</locale>
}

async function Explode(): Promise<never> {
  throw new Error('component exploded')
}

const AtomLink = defineTag(
  'atom:link',
  z.object({ href: z.string().url(), rel: z.enum(['self', 'alternate']) }),
)

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

const text = <const Url extends string>(url: Url) =>
  api.declareEndpoint({ method: 'GET', url, response: 'text' })

const getRssFeed = text('/feed.xml')
const getAtomFeed = api.declareEndpoint({
  method: 'GET',
  url: '/atom.xml',
  querySchema: z.object({ limit: z.coerce.number().optional().default(10) }),
  response: 'text',
})
const getSitemap = text('/sitemap.xml')
const getItemXml = text('/items/$id')
const postGenerateXml = api.declareEndpoint({
  method: 'POST',
  url: '/generate.xml',
  requestSchema: z.object({ title: z.string(), items: z.array(z.string()) }),
  response: 'text',
})
const getAsyncXml = text('/async.xml')
const getDiXml = text('/di/$id')
const getBadge = api.declareEndpoint({
  method: 'GET',
  url: '/badge',
  querySchema: z.object({ count: z.coerce.number() }),
  response: 'text',
})
const getSpecialXml = text('/special.xml')
const getContextXml = text('/context.xml')
const getMissing = text('/missing.xml')
const getExplode = text('/explode.xml')
const getBadTag = text('/bad-tag.xml')
const getStream = api.declareEndpoint({ method: 'GET', url: '/stream.xml', response: 'stream' })
const getBlob = api.declareEndpoint({ method: 'GET', url: '/blob.xml', response: 'blob' })
const getOptions = text('/options.xml')
const getHeaders = text('/headers.xml')
const getPlainText = text('/plain.txt')
const getJson = api.declareEndpoint({
  method: 'GET',
  url: '/api/data',
  responseSchema: z.object({ message: z.string() }),
})

@Controller()
class FeedController {
  private readonly data = inject(DataService)

  rss = handler(getRssFeed, () =>
    xml(
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          <description>A sample RSS feed</description>
          {this.data.getItems().map((item) => (
            <item>
              <title>{item.title}</title>
              <link>https://example.com/items/{item.id}</link>
              <description>{item.description}</description>
            </item>
          ))}
        </channel>
      </rss>,
      { contentType: 'application/rss+xml' },
    ),
  )

  atom = handler(getAtomFeed, async ({ params }) =>
    xml(
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>My Atom Feed</title>
        <AtomLink href="https://example.com/atom.xml" rel="self" />
        <>
          {this.data
            .getItems()
            .slice(0, params.limit)
            .map((item) => (
              <entry>
                <title>{item.title}</title>
                <summary>{item.description}</summary>
              </entry>
            ))}
        </>
      </feed>,
      { contentType: 'application/atom+xml' },
    ),
  )

  sitemap = handler(getSitemap, () =>
    xml(
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/</loc>
          <priority>1.0</priority>
        </url>
      </urlset>,
    ),
  )

  item = handler(getItemXml, ({ urlParams }) => {
    const item = this.data.getItem(String(urlParams.id))
    if (!item) {
      return xml(
        <error>
          <message>Item not found</message>
          <requestedId>{urlParams.id}</requestedId>
        </error>,
      )
    }
    return xml(
      <item id={item.id}>
        <title>{item.title}</title>
      </item>,
    )
  })

  generate = handler(postGenerateXml, ({ data }) =>
    xml(
      <generated>
        <title>{data.title}</title>
        <items count={data.items.length}>
          {data.items.map((item, index) => (
            <item index={index}>{item}</item>
          ))}
        </items>
      </generated>,
    ),
  )

  async = handler(getAsyncXml, () =>
    xml(
      <root>
        <sync>Immediate content</sync>
        <AsyncData delay={10} />
        <AsyncData delay={5} />
      </root>,
    ),
  )

  di = handler(getDiXml, ({ urlParams }, ctx) =>
    xml(
      <root requestId={ctx.use(RequestTracker).requestId}>
        <ItemComponent id={String(urlParams.id)} />
      </root>,
    ),
  )

  badge = handler(getBadge, ({ params }) => xml(<Badge count={params.count} />))

  special = handler(getSpecialXml, () =>
    xml(
      <root>
        <cdata-example>
          <CData>{'This is <raw> HTML & XML content that should not be escaped'}</CData>
        </cdata-example>
        <raw-xml-example>
          <DangerouslyInsertRawXml>
            {'<nested><element attr="value">text</element></nested>'}
          </DangerouslyInsertRawXml>
        </raw-xml-example>
        <escaped>{'<this> & "that" should be escaped'}</escaped>
      </root>,
    ),
  )

  context = handler(getContextXml, { guards: [UserGuard] }, () =>
    xml(
      <root>
        <LocaleTag />
        <UserComponent />
      </root>,
    ),
  )

  missing = handler(getMissing, () => xml(<MissingComponent />))

  explode = handler(getExplode, () =>
    xml(
      <root>
        <Explode />
      </root>,
    ),
  )

  badTag = handler(getBadTag, () => xml(<AtomLink href="not a url" rel="self" />))

  stream = handler(getStream, () => xml(<streamed>ok</streamed>))

  blob = handler(getBlob, () => xml(<blobbed>ok</blobbed>))

  options = handler(getOptions, () =>
    xml(
      <root>
        <child />
      </root>,
      { declaration: false, pretty: true, status: 203, contentType: 'text/xml; charset=UTF-8' },
    ),
  )

  headers = handler(getHeaders, (_params, ctx) => {
    ctx.reply.header('cache-control', 'max-age=60')
    ctx.reply.cookie('seen', '1')
    return xml(<root />)
  })

  // An ordinary text endpoint is left alone by the plugin.
  plain = handler(getPlainText, () => 'just text')

  json = handler(getJson, () => ({ message: 'JSON endpoint works alongside XML' }))
}

@Module({ controllers: [FeedController] })
export class AppModule {}
