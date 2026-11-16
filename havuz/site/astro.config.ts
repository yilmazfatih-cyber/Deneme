/**
 * Astro yapılandırması. Site adresi ve alt klasör ortam değişkenlerinden (SITE_URL, SITE_BASE) okunur;
 * diller src/site.config.ts'ten gelir. Günlük işler için bu dosyaya dokunmanız gerekmez.
 * Genişletme: yazı tipi değiştirme → aşağıdaki `fonts` bölümü (AGENTS.md → "Yazı tipini değiştirme");
 * yeni tümleşim → `integrations` listesi.
 */
import { createRequire } from 'node:module'
import mdx from '@astrojs/mdx'
import { satteri } from '@astrojs/markdown-satteri'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, envField, fontProviders } from 'astro/config'
import { ogImages } from './src/integrations/og-images.ts'
import { searchIndex } from './src/integrations/search-index.ts'
import { resolveDeployTarget } from './src/lib/deploy.ts'
import { createMarkdownPlugins } from './src/markdown/plugins.ts'
import { codeMetaTransformer } from './src/markdown/shiki.ts'
import { defaultLocale, locales, siteConfig } from './src/site.config.ts'

const { site, base } = resolveDeployTarget(process.env, siteConfig.url)

/** Fontsource paketlerindeki alt küme → Unicode aralığı tablosu (Türkçe için "latin" + "latin-ext" gerekir). */
const require = createRequire(import.meta.url)
const unicodeRanges = require('@fontsource-variable/figtree/unicode.json') as Record<string, string>
const range = (subset: 'latin' | 'latin-ext') => [unicodeRanges[subset] ?? '']

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 varsayılanı ('jsx') satır içi öğeler arasındaki boşluğu siler; HTML kuralı daha az şaşırtır.
  compressHTML: true,
  server: { port: 4410 },

  i18n: {
    locales: [...locales],
    defaultLocale,
    routing: { prefixDefaultLocale: false },
  },

  integrations: [
    mdx(),
    sitemap({ filter: (page) => !page.endsWith('/404/') }),
    ogImages({ siteName: siteConfig.name, brand: siteConfig.brand }),
    searchIndex(),
  ],

  markdown: {
    processor: satteri({ hastPlugins: createMarkdownPlugins({ base }) }),
    shikiConfig: {
      themes: { light: 'github-light-high-contrast', dark: 'github-dark' },
      defaultColor: false,
      transformers: [codeMetaTransformer],
    },
  },

  // Yazı tipleri npm paketlerinden (Fontsource) alınır ve siteyle birlikte sunulur; dış sunucuya istek gitmez.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Figtree',
      cssVariable: '--font-body',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2'],
            weight: '300 900',
            style: 'normal',
            unicodeRange: range('latin'),
          },
          {
            src: ['@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2'],
            weight: '300 900',
            style: 'normal',
            unicodeRange: range('latin-ext'),
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Instrument Serif',
      cssVariable: '--font-heading',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          {
            src: ['@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2'],
            weight: 400,
            style: 'normal',
            unicodeRange: range('latin'),
          },
          {
            src: ['@fontsource/instrument-serif/files/instrument-serif-latin-ext-400-normal.woff2'],
            weight: 400,
            style: 'normal',
            unicodeRange: range('latin-ext'),
          },
        ],
      },
    },
  ],

  env: {
    schema: {
      PUBLIC_FORM_ENDPOINT: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
      PUBLIC_NEWSLETTER_ENDPOINT: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
})
