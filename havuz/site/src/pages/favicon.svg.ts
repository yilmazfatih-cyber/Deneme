/** Sekme simgesi: /favicon.svg. Marka renginden üretilir (src/lib/logo.ts, src/site.config.ts → brand). */
import type { APIRoute } from 'astro'
import { logoMarkSvg } from '../lib/logo.ts'
import { buildTheme } from '../lib/theme.ts'
import { siteConfig } from '../site.config.ts'

export const GET: APIRoute = () => {
  const light = buildTheme(siteConfig.brand, 'light')
  const svg = logoMarkSvg({ bg: light.brand ?? siteConfig.brand.primary, fg: light['on-brand'] ?? '#ffffff', size: 64 })
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
}
