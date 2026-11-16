/** English blog RSS feed: /en/rss.xml. Builder: src/lib/feeds.ts. */
import type { APIRoute } from 'astro'
import { blogFeed } from '../../lib/feeds.ts'

export const GET: APIRoute = () => blogFeed('en')
