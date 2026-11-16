/**
 * İçerik koleksiyonlarının kaydı: hangi klasördeki dosyalar hangi şemaya uyar.
 *   Markdown: blog, belgeler, sayfalar → src/content/<koleksiyon>/<dil>/<kisa-ad>.md(x)
 *   Veri:     anasayfa, ozellikler, sss, fiyatlar, referanslar, ekip → src/content/<koleksiyon>/<dil>.json
 * Şemalar (alanlar ve hata iletileri): src/lib/content-schemas.ts. Sorgu yardımcıları: src/lib/content.ts.
 * Genişletme: yeni koleksiyon → şemayı content-schemas.ts'e, tanımı buraya ekleyin ve `collections` nesnesine yazın.
 * Dosya adı "_" ile başlayan içerik (ör. _taslak.md) yok sayılır.
 */
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import {
  blogSchema,
  docSchema,
  faqSchema,
  featuresSchema,
  homeSchema,
  pageSchema,
  pricingSchema,
  teamSchema,
  testimonialsSchema,
} from './lib/content-schemas.ts'

const markdown = (folder: string) => glob({ base: `./src/content/${folder}`, pattern: '**/[^_]*.{md,mdx}' })
const data = (folder: string) => glob({ base: `./src/content/${folder}`, pattern: '[^_]*.json' })

const blog = defineCollection({ loader: markdown('blog'), schema: ({ image }) => blogSchema(image) })
const belgeler = defineCollection({ loader: markdown('belgeler'), schema: docSchema })
const sayfalar = defineCollection({ loader: markdown('sayfalar'), schema: pageSchema })

const anasayfa = defineCollection({ loader: data('anasayfa'), schema: homeSchema })
const ozellikler = defineCollection({ loader: data('ozellikler'), schema: featuresSchema })
const sss = defineCollection({ loader: data('sss'), schema: faqSchema })
const fiyatlar = defineCollection({ loader: data('fiyatlar'), schema: pricingSchema })
const referanslar = defineCollection({ loader: data('referanslar'), schema: testimonialsSchema })
const ekip = defineCollection({ loader: data('ekip'), schema: teamSchema })

// YENİ KOLEKSİYON BURAYA
export const collections = { blog, belgeler, sayfalar, anasayfa, ozellikler, sss, fiyatlar, referanslar, ekip }
