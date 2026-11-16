/** Türkçe blog RSS akışı: /rss.xml. Üretim: src/lib/feeds.ts. */
import type { APIRoute } from 'astro'
import { blogFeed } from '../lib/feeds.ts'

export const GET: APIRoute = () => blogFeed('tr')
