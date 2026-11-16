/**
 * robots.txt: arama motorlarına bütün sayfaları açar ve site haritasını gösterir.
 * Not: robots.txt yalnız alan adının kökünde okunur; site alt klasörde yayınlanıyorsa (GitHub proje sayfası)
 * bu dosya arama motorlarınca dikkate alınmaz (docs/YAYINLAMA.md).
 */
import type { APIRoute } from 'astro'
import { absoluteUrl } from '../lib/url.ts'

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap-index.xml')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
