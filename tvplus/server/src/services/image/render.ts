/**
 * Görsel çizici: kaynak baytlarından (ya da kaynaksız, tohumdan) istenen tip ve boyutta görsel üretir.
 * Saf işlev gibidir — ağa, diske, kataloğa dokunmaz; önbellek ve kaynak yükleme `pipeline.ts`'dedir.
 */
import sharp from 'sharp'
import type { ArtworkSource } from '../../kernel/services'
import type { ArtworkTypeName } from '../../kernel/imageUrls'
import { BG, TEXT_1, TEXT_2, generatedBackgroundSvg, hsl, initialsOf, paletteFromSeed } from './generated'
import { faceAvatarSvg, faceIndexOf } from './avatarFace'
import { fitText, textBlockSvg, upperTr, type TextStyle } from './text'

export interface RenderInput {
  type: ArtworkTypeName
  width: number
  height: number
  format: 'webp' | 'jpg'
  source: ArtworkSource
  /** Kaynak görselin baytları; yoksa kapak üretilir. */
  image: Buffer | null
}

const TITLE_STYLE: TextStyle = { weight: 800, letterSpacing: -0.02 }
const LOGO_STYLE: TextStyle = { weight: 900, letterSpacing: -0.03 }
const SUB_STYLE: TextStyle = { weight: 600, letterSpacing: 0 }

/** CSS object-position ("50% 35%", "left top", "center") → 0–1 aralığında odak. Tanınmayan değer ortadır. */
export function parseFocal(focal: string | null | undefined): { x: number; y: number } {
  let x: number | null = null
  let y: number | null = null
  const pending: number[] = []
  for (const tok of (focal ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    if (tok === 'left') x = 0
    else if (tok === 'right') x = 1
    else if (tok === 'top') y = 0
    else if (tok === 'bottom') y = 1
    else if (tok === 'center') pending.push(0.5)
    else if (/^-?\d+(\.\d+)?%$/.test(tok)) pending.push(Math.min(1, Math.max(0, parseFloat(tok) / 100)))
    else pending.push(0.5) // px vb. birimler: kaynak boyutu bilinmeden anlamsız, orta kabul edilir
  }
  for (const v of pending) {
    if (x === null) x = v
    else if (y === null) y = v
  }
  return { x: x ?? 0.5, y: y ?? 0.5 }
}

interface RawImage {
  data: Buffer
  width: number
  height: number
  channels: 1 | 2 | 3 | 4
}

/** Kaynağı çözer (EXIF yönü uygulanır) ve ham piksele çevirir. */
async function decode(buf: Buffer): Promise<RawImage & { hasAlpha: boolean }> {
  const { data, info } = await sharp(buf, { failOn: 'error', limitInputPixels: 50_000_000 })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let hasAlpha = false
  if (info.channels === 4 || info.channels === 2) {
    // Gerçekten saydam piksel var mı (saydamlık kanalı olup hepsi opak olan PNG'ler de vardır)
    for (let i = info.channels - 1; i < data.length; i += info.channels * 7)
      if ((data[i] ?? 255) < 250) {
        hasAlpha = true
        break
      }
  }
  return { data, width: info.width, height: info.height, channels: info.channels, hasAlpha }
}

const rawSharp = (img: RawImage) =>
  sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } })

/**
 * Siyah şerit (letterbox/pillarbox) ayıklama: YouTube hqdefault 4:3 küçük resimlerinde 16:9 videonun üstünde ve
 * altında siyah bant olur; kırpmadan önce atılır. Bant, neredeyse saf siyah ve iki tarafta yaklaşık eşit olmalıdır.
 */
export function letterboxBounds(img: RawImage): { left: number; top: number; width: number; height: number } {
  const { data, width, height, channels } = img
  const colorCh = Math.min(3, channels)
  const isDarkLine = (getPx: (i: number) => number, len: number) => {
    let dark = 0
    for (let i = 0; i < len; i++) {
      const o = getPx(i)
      let max = 0
      for (let c = 0; c < colorCh; c++) max = Math.max(max, data[o + c] ?? 0)
      if (max <= 18) dark++
    }
    return dark >= len * 0.985
  }
  const row = (y: number) => isDarkLine((x) => (y * width + x) * channels, width)
  const col = (x: number) => isDarkLine((y) => (y * width + x) * channels, height)
  const scan = (n: number, test: (i: number) => boolean, fromEnd: boolean) => {
    let k = 0
    while (k < n / 3 && test(fromEnd ? n - 1 - k : k)) k++
    return k
  }
  let top = scan(height, row, false)
  let bottom = scan(height, row, true)
  let left = scan(width, col, false)
  let right = scan(width, col, true)
  const symmetric = (a: number, b: number, n: number) => a >= n * 0.04 && b >= n * 0.04 && Math.abs(a - b) <= n * 0.03
  // JPEG halkalanması bant kenarında bir-iki satırı griye çeker: bulunan banda küçük bir pay eklenir.
  const grow = (k: number, n: number) => (k > 0 ? Math.min(Math.floor(n / 3), k + Math.ceil(n * 0.006)) : 0)
  if (!symmetric(top, bottom, height)) top = bottom = 0
  else [top, bottom] = [grow(top, height), grow(bottom, height)]
  if (!symmetric(left, right, width)) left = right = 0
  else [left, right] = [grow(left, width), grow(right, width)]
  return { left, top, width: width - left - right, height: height - top - bottom }
}

/** Hedef en-boy oranında, odak noktasına göre (CSS object-position anlamıyla) kırpma penceresi. */
export function coverWindow(srcW: number, srcH: number, ratio: number, focal: { x: number; y: number }) {
  if (srcW / srcH > ratio) {
    const w = Math.max(1, Math.min(srcW, Math.round(srcH * ratio)))
    return { left: Math.round((srcW - w) * focal.x), top: 0, width: w, height: srcH }
  }
  const h = Math.max(1, Math.min(srcH, Math.round(srcW / ratio)))
  return { left: 0, top: Math.round((srcH - h) * focal.y), width: srcW, height: h }
}

/** Kaynağı kırpar ve hedef kutuya ölçekler; sonuç RGBA ham piksel. */
async function coverCrop(img: RawImage, w: number, h: number, focalStr: string): Promise<Buffer> {
  const lb = letterboxBounds(img)
  const win = coverWindow(lb.width, lb.height, w / h, parseFocal(focalStr))
  return rawSharp(img)
    .extract({ left: lb.left + win.left, top: lb.top + win.top, width: win.width, height: win.height })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .png()
    .toBuffer()
}

/** Kaynağı kutuya sığdırır (kırpmadan), kenar boşluğuyla saydam zemine ortalar. */
async function containPadded(img: RawImage, w: number, h: number, padRatio: number): Promise<Buffer> {
  const padX = Math.round(w * padRatio)
  const padY = Math.round(h * padRatio)
  const inner = await rawSharp(img)
    .ensureAlpha()
    .resize(Math.max(1, w - 2 * padX), Math.max(1, h - 2 * padY), { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer({ resolveWithObject: true })
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: inner.data, left: Math.round((w - inner.info.width) / 2), top: Math.round((h - inner.info.height) / 2) },
    ])
    .png()
    .toBuffer()
}

const svgDoc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

/** Dikey afişte başlık bloğu (+ isteğe bağlı alt başlık), alta ortalı. `bottom` bloğun alt kenarı. */
async function posterTitleSvg(
  w: number,
  h: number,
  title: string,
  subtitle: string | null,
  bottom: number,
): Promise<string> {
  const padX = w * 0.08
  const maxWidth = w - 2 * padX
  let sub = ''
  let subH = 0
  if (subtitle) {
    const s = await fitText(subtitle, {
      style: SUB_STYLE,
      maxWidth,
      maxHeight: h * 0.08,
      maxLines: 1,
      maxSize: w * 0.052,
      minSize: w * 0.036,
      lineHeight: 1.2,
    })
    subH = s.blockHeight + h * 0.012
    sub = textBlockSvg(s, SUB_STYLE, { align: 'middle', x: w / 2, top: bottom - s.blockHeight, fill: TEXT_2 })
  }
  const t = await fitText(title, {
    style: TITLE_STYLE,
    maxWidth,
    maxHeight: h * 0.36,
    maxLines: 3,
    maxSize: w * 0.145,
    minSize: w * 0.06,
    lineHeight: 1.04,
  })
  const titleSvg = textBlockSvg(t, TITLE_STYLE, {
    align: 'middle',
    x: w / 2,
    top: bottom - subH - t.blockHeight,
    fill: TEXT_1,
    filter: 'url(#tshadow)',
  })
  return titleSvg + sub
}

/** Yatay (16:9) görselde sol alta yaslı başlık + alt başlık. */
async function landscapeTitleSvg(w: number, h: number, title: string, subtitle: string | null): Promise<string> {
  const padX = w * 0.06
  const bottom = h * 0.88
  const maxWidth = w * 0.72
  let sub = ''
  let subH = 0
  if (subtitle) {
    const s = await fitText(subtitle, {
      style: SUB_STYLE,
      maxWidth,
      maxHeight: h * 0.12,
      maxLines: 1,
      maxSize: h * 0.065,
      minSize: h * 0.042,
      lineHeight: 1.2,
    })
    subH = s.blockHeight + h * 0.02
    sub = textBlockSvg(s, SUB_STYLE, { align: 'start', x: padX, top: bottom - s.blockHeight, fill: TEXT_2 })
  }
  const t = await fitText(title, {
    style: TITLE_STYLE,
    maxWidth,
    maxHeight: h * 0.5,
    maxLines: 3,
    maxSize: h * 0.17,
    minSize: h * 0.075,
    lineHeight: 1.04,
  })
  return (
    textBlockSvg(t, TITLE_STYLE, {
      align: 'start',
      x: padX,
      top: bottom - subH - t.blockHeight,
      fill: TEXT_1,
      filter: 'url(#tshadow)',
    }) + sub
  )
}

const shadowFilter = (h: number) =>
  `<filter id="tshadow" x="-10%" y="-30%" width="120%" height="160%">` +
  `<feDropShadow dx="0" dy="${(h * 0.004).toFixed(2)}" stdDeviation="${(h * 0.008).toFixed(2)}" flood-color="#000" flood-opacity="0.45"/></filter>`

/** Kaynaksız kapak (tohumdan). */
async function generatedCover(input: RenderInput): Promise<Buffer> {
  const { width: w, height: h, type, source } = input
  const p = paletteFromSeed(source.seed || source.title)
  let text = ''
  if (type === 'BOXART') text = await posterTitleSvg(w, h, source.title, source.subtitle, h * 0.92)
  else if (type === 'STORY_ART' || type === 'EPISODE_STILL')
    text = await landscapeTitleSvg(w, h, source.title, source.subtitle)
  // BILLBOARD yazısız: vitrinde başlık logosu (TITLE_LOGO) ve metinler arayüzce üstüne yerleştirilir.
  const shade = type === 'BILLBOARD' ? 'left' : 'bottom'
  const svg = svgDoc(w, h, `<defs>${shadowFilter(h)}</defs>` + generatedBackgroundSvg(w, h, p, { shade }) + text)
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Başlık logosu: saydam zemin, ağır yazı, en çok 2 satır, kutuya sığdırılmış. */
async function titleLogo(input: RenderInput): Promise<Buffer> {
  const { width: w, height: h } = input
  const padX = w * 0.03
  const padY = h * 0.08
  const t = await fitText(input.source.title, {
    style: LOGO_STYLE,
    maxWidth: w - 2 * padX,
    maxHeight: h - 2 * padY,
    maxLines: 2,
    maxSize: h * 0.6,
    minSize: h * 0.14,
    lineHeight: 0.98,
  })
  const filter =
    `<filter id="ds" x="-10%" y="-30%" width="120%" height="160%">` +
    `<feDropShadow dx="0" dy="${(h * 0.012).toFixed(2)}" stdDeviation="${(h * 0.022).toFixed(2)}" flood-color="#000" flood-opacity="0.55"/></filter>`
  const top = (h - t.blockHeight) / 2
  const svg = svgDoc(
    w,
    h,
    `<defs>${filter}</defs>` +
      textBlockSvg(t, LOGO_STYLE, { align: 'start', x: padX, top, fill: TEXT_1, filter: 'url(#ds)' }),
  )
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Logosu olmayan kanal: tohum renginde yuvarlatılmış karo + baş harfler. */
async function channelTile(input: RenderInput): Promise<Buffer> {
  const { width: w, height: h, source } = input
  const p = paletteFromSeed(source.seed || source.title)
  const r = w * 0.22
  const ini = initialsOf(source.title)
  const t = await fitText(ini, {
    style: TITLE_STYLE,
    maxWidth: w * 0.7,
    maxHeight: h * 0.42,
    maxLines: 1,
    maxSize: h * 0.42,
    minSize: h * 0.12,
    lineHeight: 1,
  })
  const body =
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(p.hue1, p.sat - 12, 24)}"/>` +
    `<stop offset="1" stop-color="${hsl(p.hue2, p.sat - 18, 13)}"/></linearGradient></defs>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="url(#g)" stroke="#fff" stroke-opacity="0.1"/>` +
    textBlockSvg(t, TITLE_STYLE, { align: 'middle', x: w / 2, top: (h - t.blockHeight) / 2, fill: TEXT_1 })
  return sharp(Buffer.from(svgDoc(w, h, body)))
    .png()
    .toBuffer()
}

/** Görseli olmayan profil: tohum renginde daire + ilk harf. */
async function avatarDisc(input: RenderInput): Promise<Buffer> {
  const { width: w, height: h, source } = input
  const p = paletteFromSeed(source.seed || source.title)
  const initial = upperTr([...source.title.trim()][0] ?? '?')
  const t = await fitText(initial, {
    style: TITLE_STYLE,
    maxWidth: w * 0.6,
    maxHeight: h * 0.5,
    maxLines: 1,
    maxSize: h * 0.5,
    minSize: h * 0.2,
    lineHeight: 1,
  })
  const body =
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(p.hue1, p.sat + 5, 46)}"/>` +
    `<stop offset="1" stop-color="${hsl(p.hue2, p.sat, 30)}"/></linearGradient></defs>` +
    `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="url(#g)"/>` +
    textBlockSvg(t, TITLE_STYLE, { align: 'middle', x: w / 2, top: (h - t.blockHeight) / 2, fill: TEXT_1 })
  return sharp(Buffer.from(svgDoc(w, h, body)))
    .png()
    .toBuffer()
}

/** Kaynağın siyah şeritlerden arındırılmış en-boy oranı (genişlik / yükseklik). */
function trimmedRatio(img: RawImage): number {
  const lb = letterboxBounds(img)
  return lb.width / lb.height
}

/**
 * 'crop': 2:3 pencere odak noktasına göre kırpılır, alt perde + başlık eklenir. Kaynakta gömülü yazı varsa
 * yarım kelimeler kalabilir; yalnızca yazısız, temiz kareler için.
 */
async function posterCrop(img: RawImage, input: RenderInput): Promise<Buffer> {
  const { width: w, height: h, source } = input
  const cropped = await coverCrop(img, w, h, source.focal)
  const shade =
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0.38" stop-color="${BG}" stop-opacity="0"/><stop offset="0.68" stop-color="${BG}" stop-opacity="0.6"/>` +
    `<stop offset="1" stop-color="${BG}" stop-opacity="0.94"/></linearGradient>`
  const text = await posterTitleSvg(w, h, source.title, null, h * 0.93)
  const overlay = svgDoc(
    w,
    h,
    `<defs>${shade}${shadowFilter(h)}</defs><rect width="${w}" height="${h}" fill="url(#shade)"/>${text}`,
  )
  return sharp(cropped)
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toBuffer()
}

/**
 * 'contain' (varsayılan): kaynak hiç kırpılmaz. Zemin = aynı görselin bulanık, karartılmış hali (görselin kendi
 * renklerinde yumuşak bir alan); üstte tam genişlikte yatay görselin tamamı; altında başlık ve alt başlık.
 */
async function posterContain(img: RawImage, input: RenderInput): Promise<Buffer> {
  const { width: w, height: h, source } = input
  const lb = letterboxBounds(img)
  const trimmed = rawSharp(img).extract({ left: lb.left, top: lb.top, width: lb.width, height: lb.height })
  const trimmedPng = await trimmed.png().toBuffer()

  // Zemin: kapla-kırp → çok küçült → bulanıklaştır → karart → büyüt. Biçim seçilmez, yalnız renk alanı kalır.
  const small = Math.max(6, Math.round(w / 28))
  const bg = await sharp(trimmedPng)
    .resize(small, Math.round((small * h) / w), { fit: 'cover' })
    .blur(Math.max(0.6, small / 6))
    .modulate({ brightness: 0.38, saturation: 1.2 })
    .resize(w, h, { fit: 'fill', kernel: 'cubic' })
    .blur(Math.max(1, w / 30))
    .png()
    .toBuffer()

  // Görselin tamamı, tam genişlikte, üst kenardan biraz aşağıda
  const imgH = Math.max(1, Math.min(Math.round(w / (lb.width / lb.height)), Math.round(h * 0.5)))
  const imgW = Math.round(imgH * (lb.width / lb.height)) >= w ? w : Math.round(imgH * (lb.width / lb.height))
  const top = Math.round(h * 0.085)
  const left = Math.round((w - imgW) / 2)
  const fg = await sharp(trimmedPng).resize(imgW, imgH, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer()

  // Yazı alanı: görselin altından alt kenara kadar; blok görselin hemen altına yaslanır (satırda başlıklar aynı hizada)
  const areaTop = top + imgH + h * 0.06
  const areaBottom = h * 0.94
  const padX = w * 0.08
  const maxWidth = w - 2 * padX
  const sub = source.subtitle
    ? await fitText(source.subtitle, {
        style: SUB_STYLE,
        maxWidth,
        maxHeight: h * 0.07,
        maxLines: 1,
        maxSize: w * 0.05,
        minSize: w * 0.036,
        lineHeight: 1.2,
      })
    : null
  const subGap = sub ? h * 0.018 : 0
  const t = await fitText(source.title, {
    style: TITLE_STYLE,
    maxWidth,
    maxHeight: areaBottom - areaTop - (sub ? sub.blockHeight + subGap : 0),
    maxLines: 3,
    maxSize: w * 0.125,
    minSize: w * 0.06,
    lineHeight: 1.05,
  })
  const blockTop = areaTop
  const text =
    textBlockSvg(t, TITLE_STYLE, { align: 'middle', x: w / 2, top: blockTop, fill: TEXT_1, filter: 'url(#tshadow)' }) +
    (sub
      ? textBlockSvg(sub, SUB_STYLE, {
          align: 'middle',
          x: w / 2,
          top: blockTop + t.blockHeight + subGap,
          fill: TEXT_2,
        })
      : '')

  const defs =
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${BG}" stop-opacity="0.25"/><stop offset="0.45" stop-color="${BG}" stop-opacity="0.2"/>` +
    `<stop offset="1" stop-color="${BG}" stop-opacity="0.85"/></linearGradient>` +
    `<filter id="imgshadow" x="-10%" y="-20%" width="120%" height="150%"><feGaussianBlur stdDeviation="${(h * 0.012).toFixed(2)}"/></filter>` +
    shadowFilter(h)
  const under = svgDoc(
    w,
    h,
    `<defs>${defs}</defs><rect width="${w}" height="${h}" fill="url(#shade)"/>` +
      // Görselin altına yumuşak gölge: zeminden ayrışsın
      `<rect x="${left}" y="${top + h * 0.01}" width="${imgW}" height="${imgH}" fill="#000" fill-opacity="0.55" filter="url(#imgshadow)"/>`,
  )
  const over = svgDoc(w, h, `<defs>${shadowFilter(h)}</defs>${text}`)
  return sharp(bg)
    .composite([{ input: Buffer.from(under) }, { input: fg, left, top }, { input: Buffer.from(over) }])
    .png()
    .toBuffer()
}

/** Kaynaklı dikey afiş: dikey kaynak (gerçek afiş) olduğu gibi kırpılır; yatay kaynak posterFit'e göre düzenlenir. */
async function posterFromSource(img: RawImage, input: RenderInput): Promise<Buffer> {
  if (img.height / img.width >= 1.2) return coverCrop(img, input.width, input.height, input.source.focal)
  if (trimmedRatio(img) > 1.2 && (input.source.posterFit ?? 'contain') === 'contain') return posterContain(img, input)
  return posterCrop(img, input)
}

/** Bu tip saydamlık taşır mı (jpg istenirse zemin rengine düzleştirilir). */
export const isTransparentType = (type: ArtworkTypeName) =>
  type === 'TITLE_LOGO' || type === 'CHANNEL_LOGO' || type === 'AVATAR'

async function encode(png: Buffer, format: 'webp' | 'jpg'): Promise<Buffer> {
  const s = sharp(png)
  if (format === 'jpg') return s.flatten({ background: BG }).jpeg({ quality: 80, mozjpeg: true }).toBuffer()
  return s.webp({ quality: 78, alphaQuality: 90, effort: 4 }).toBuffer()
}

/**
 * Ana çizim işlevi. `input.image` çözülemezse kaynaksız kapağa düşer (fırlatmaz) ve `decodeFailed` true döner.
 */
export async function renderArtwork(input: RenderInput): Promise<{ body: Buffer; decodeFailed: boolean }> {
  let img: (RawImage & { hasAlpha: boolean }) | null = null
  let decodeFailed = false
  if (input.image) {
    try {
      img = await decode(input.image)
    } catch {
      img = null
      decodeFailed = true
    }
  }
  // Başlık logosu yalnızca saydam bir kaynaktan (gerçek logo) alınır; fotoğraf/küçük resim logo yerine geçmez.
  if (img && input.type === 'TITLE_LOGO' && !img.hasAlpha) img = null
  const { type, width: w, height: h } = input
  let png: Buffer
  if (img) {
    switch (type) {
      case 'BOXART':
        png = await posterFromSource(img, input)
        break
      case 'TITLE_LOGO':
        png = await containPadded(img, w, h, 0.02)
        break
      case 'CHANNEL_LOGO':
        png = await containPadded(img, w, h, 0.12)
        break
      default:
        // STORY_ART, BILLBOARD, EPISODE_STILL, AVATAR: odak noktasına göre kapla-kırp
        png = await coverCrop(img, w, h, input.source.focal)
    }
  } else {
    switch (type) {
      case 'TITLE_LOGO':
        png = await titleLogo(input)
        break
      case 'CHANNEL_LOGO':
        png = await channelTile(input)
        break
      case 'AVATAR': {
        // Üretilen yüz avatarları (`Avatar:yuz-NN` tohumu); diğer kaynaksız avatarlar baş harfli disk
        const face = faceIndexOf(input.source.seed)
        png =
          face !== null
            ? await sharp(Buffer.from(faceAvatarSvg(face, w)))
                .resize(w, h)
                .png()
                .toBuffer()
            : await avatarDisc(input)
        break
      }
      default:
        png = await generatedCover(input)
    }
  }
  return { body: await encode(png, input.format), decodeFailed }
}
