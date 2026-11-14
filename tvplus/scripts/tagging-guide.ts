/**
 * Etiketleme kılavuzu üreteci (`npm run tagging:guide`): content/tagging/vocabulary.json'dan
 * docs/ETIKETLEME_KILAVUZU.md dosyasını üretir. Kılavuz elle yazılmaz; sözlük değişince yeniden üretilir.
 * İki işlenmiş örnek, depodaki örnek fişlerden (Sintel ve Köydeki Lezzet; yoksa ilk iki fiş) alınır.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import prettier from 'prettier'
import { zTitle } from '../shared/content-schema'
import { MATURITY, MATURITY_REASONS, GENRES } from '../shared/taxonomy'
import type { TagSheet, TagVocabulary } from '../shared/tagging-schema'
import { descriptorsOf, indexVocabulary, loadTaggingContentOrThrow } from '../server/src/services/tagging/vocabulary'
import { defaultContentDir, ROOT_DIR, titleFiles } from './lib/content'
import { isMain } from './lib/net'

export const GUIDE_FILE = join(ROOT_DIR, 'docs', 'ETIKETLEME_KILAVUZU.md')
const PREFERRED_EXAMPLES = [80010001, 80046000]

const GROUP_TEXT: Record<string, { title: string; intro: string }> = {
  ADVISORY: {
    title: 'İçerik uyarıları',
    intro:
      'Bu ölçeklerde yapımdaki **en yoğun anı** esas alın: tek bir sahne bile seviyeyi belirler. Her seviyenin yanında, o seviyenin gerektirdiği en düşük RTÜK işareti yazılıdır.',
  },
  TONE: {
    title: 'Ton',
    intro: 'Bu ölçeklerde yapımın **genelini** esas alın: tek bir sahne değil, izleyicide kalan genel duygu.',
  },
  STORY: {
    title: 'Anlatı',
    intro:
      'Bu ölçekler hikâyenin nasıl anlatıldığını ölçer. Hikâyesi olmayan yapımlarda (söyleşi, konser, haber) "Sonun netliği"ni boş bırakın.',
  },
  FORM: { title: 'Biçim', intro: 'Bu ölçekler görüntüyü ve yapımın bilgi verme amacını ölçer.' },
}

const SLOT_TEXT: Record<string, string> = {
  ADJECTIVE: 'sıfat',
  REGION: 'köken',
  SOURCE: 'uyarlama kaynağı',
  SETTING: 'mekân',
  PERIOD: 'hikâyenin dönemi',
  SUBJECT: 'konu',
  AGE: 'yaş grubu',
  LEAD: 'ana karakter',
  FORMAT: 'biçim',
  ERA: 'yapım dönemi',
  PERSON: 'kişi',
}

/** Markdown tablosu hücresi: dikey çizgi ve satır sonu kaçırılır. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export interface GuideExample {
  title: string
  year: number
  type: 'MOVIE' | 'SHOW'
  sheet: TagSheet
}

export function renderGuide(vocabulary: TagVocabulary, examples: GuideExample[]): string {
  const index = indexVocabulary(vocabulary)
  const L: string[] = []
  const p = (...lines: string[]) => L.push(...lines)

  p(
    '# TV+ etiketleme kılavuzu',
    '',
    `> Bu dosya \`npm run tagging:guide\` ile \`content/tagging/vocabulary.json\` sözlüğünden **üretilir**; elle düzenlemeyin.`,
    `> Sözlük sürümü: **${vocabulary.version}**. Sözlük değişince kılavuz yeniden üretilir ve fişler bu sürümle doldurulur.`,
    '',
    '## 1. Etiketleme ne işe yarar',
    '',
    'Her yapım için bir **etiket fişi** doldurursunuz: ölçeklerde 0–5 arası bir seviye, yüzlerde listeden değerler. Fişler birleşerek yapımın',
    '"geçerli etiketlerini" oluşturur. Bunlardan iki şey çıkar:',
    '',
    '- **Mikro türler:** "Uzay Keşfi Hakkında Düşündürücü Belgeseller" gibi dar kategoriler. Geniş olanlar ana sayfada satır olur; dar olanlar',
    '  görünmez ama "Buna benzer" ve "Çünkü … izledin" önerilerini besler.',
    '- **İçerik uyarısı denetimi:** fişinizdeki şiddet, cinsellik vb. seviyeler yapımın RTÜK işaretiyle karşılaştırılır.',
    '',
    'Bu yüzden her seviye, yorumla değil **yazılı ölçüte** göre seçilir. İki etiketleyici aynı yapımı izlediğinde aynı fişi doldurabilmelidir.',
    '',
    '## 2. Nasıl etiketlenir',
    '',
    '1. **Yapımın tamamını izleyin.** Filmde baştan sona; dizide ilk sezonun bütün bölümlerini. Fragman, özet ya da başkasının yorumuyla fiş gönderilmez.',
    '   İzlemeyi bitirmeden kaydettiğiniz fiş **taslak** kalır; gönderilen fişte "yapımın tamamı izlendi" (`watched: true`) işaretli olmalıdır.',
    "2. **Her ölçekte soruyu okuyun, sonra seviyeleri 0'dan yukarı doğru okuyun.** Gördüğünüz ya da duyduğunuz şeyi en iyi anlatan seviyeyi seçin.",
    '3. **İki seviye arasında kalırsanız düşük olanı seçin.** Seviyeyi yükseltmek için ölçütteki şeyin gerçekten ekranda olması gerekir.',
    '4. **İçerik uyarılarında en yoğun anı, ton ve anlatıda yapımın genelini esas alın** (bkz. ölçek grupları). Örnek: filmde',
    '   yalnız bir sahnede yakın çekimde kanlı bir yara görünüyorsa "Kan ve yara" 3 olur; aynı film baştan sona neşeliyse "Karanlık ton" yine 0–1 kalır.',
    '5. **Emin değilseniz boş bırakın.** Boş, "değerlendirilmedi" demektir ve uzlaşıda sayılmaz; boş bırakmak tahmin etmekten iyidir.',
    '6. **Yüzlerde yalnız yapımı gerçekten tanımlayan değerleri seçin.** Her yüzün yanında en çok kaç değer seçilebileceği yazılıdır.',
    '   Hikâyede bir an görünen bir şey (ör. tek sahnelik hastane) mekân sayılmaz.',
    '7. **Her etiketleyici kendi fişini doldurur.** Başkasının fişine bakmadan doldurun; farklı görüşler uzlaşıda birleşir.',
    '   Kimliğiniz bir takma addır (ör. `etiket-01`); gerçek adınızı ya da e-postanızı kullanmayın.',
    '8. **Not yazın.** Kararsız kaldığınız seviyeleri, seviyeyi belirleyen sahneyi (yaklaşık dakikasıyla) ve listede karşılığını bulamadığınız',
    '   özellikleri nota yazın. Not en çok 2000 karakterdir.',
    '',
    '### Fişin yolculuğu',
    '',
    '| Durum | Anlamı | Kim |',
    '| --- | --- | --- |',
    '| Taslak (`DRAFT`) | Kaydedildi, henüz gönderilmedi; uzlaşıya girmez | etiketleyici |',
    '| Gönderildi (`SUBMITTED`) | İzleme bitti, onay bekliyor | etiketleyici |',
    '| Onaylandı (`APPROVED`) | Uzlaşıya girer | içerik sorumlusu |',
    '',
    'Onaylı fişlerin uzlaşısı: her ölçekte fişlerin **ortancası** (çift sayıda fişte ortadaki iki değerin ortalaması aşağı yuvarlanır), her yüzde',
    '**fişlerin yarıdan fazlasında** seçilmiş değerler. Fişlerin birbirine ne kadar yakın olduğu 0–1 arası bir **uyum puanı** olarak gösterilir;',
    'düşük uyum, ölçütün farklı okunduğunu gösterir ve fişler yeniden gözden geçirilir.',
    '',
    'Onaylı insan fişi olmayan yapımlarda önce depodaki **örnek fiş** (izlenmeden, özetten doldurulmuş), o da yoksa künyeden kurulan **otomatik',
    'öneri** kullanılır. İkisi de yalnız başlangıç noktasıdır; sizin fişiniz onaylanınca onların yerini alır.',
    '',
    '### RTÜK uyarıları',
    '',
    'Uyarı ölçeklerinde seçtiğiniz seviye, yapımın taşıdığı işaretten daha yükseğini (ör. başlık 7+ iken 13+) ya da başlıkta yazılı olmayan bir',
    'gerekçeyi gerektiriyorsa stüdyo ekranında uyarı çıkar. **İşareti kendiniz değiştirmeyin;** seviyeyi ölçüte göre doğru seçtiyseniz notta',
    'sahneyi belirtin, içerik sorumlusu işareti gözden geçirir.',
    '',
    `İşaretler: ${Object.entries(MATURITY)
      .map(([k, m]) => (m.certificationValue === k ? `\`${k}\`` : `\`${k}\` (${m.certificationValue})`))
      .join(' · ')}. Gerekçeler: ${Object.values(MATURITY_REASONS).join(' · ')}.`,
    '',
  )

  /* ── Ölçekler ── */
  p('## 3. Ölçekler (0–5)', '')
  let n = 0
  for (const group of ['ADVISORY', 'TONE', 'STORY', 'FORM'] as const) {
    const scales = vocabulary.scales.filter((s) => s.group === group)
    if (!scales.length) continue
    p(`### ${GROUP_TEXT[group]!.title}`, '', GROUP_TEXT[group]!.intro, '')
    for (const s of scales) {
      n++
      p(`#### 3.${n}. ${s.name} (\`${s.key}\`)`, '', `**Soru:** ${s.question}`, '')
      if (s.advisory) {
        p(`RTÜK gerekçesi: **${MATURITY_REASONS[s.advisory.reason]}**`, '')
        p('| Seviye | Ad | Ölçüt | En düşük işaret |', '| :-: | --- | --- | :-: |')
        s.levels.forEach((l) =>
          p(`| ${l.value} | ${cell(l.label)} | ${cell(l.description)} | ${s.advisory!.ratings[l.value]} |`),
        )
      } else {
        p('| Seviye | Ad | Ölçüt |', '| :-: | --- | --- |')
        s.levels.forEach((l) => p(`| ${l.value} | ${cell(l.label)} | ${cell(l.description)} |`))
      }
      p('')
      if (s.descriptors.length)
        p(
          `Mikro tür adına giren sıfat: ${s.descriptors
            .map((d) => `${d.min === d.max ? d.min : `${d.min}–${d.max}`} → **${d.adjective}**`)
            .join(' · ')}`,
          '',
        )
    }
  }

  /* ── Yüzler ── */
  p(
    '## 4. Yüzler (listeden seçilen etiketler)',
    '',
    '"Addaki ifade" sütunu, değerin mikro tür adında nasıl görüneceğidir. İfadesi olmayan değerler fişte kullanılır ama ada girmez.',
    '"Ek sıfatlar" yüzü, ölçeklerin anlatamadığı nitelikler içindir: "Romantik", "Komik", "Karanlık" gibi sıfatlar ölçeklerden kendiliğinden',
    'çıkar; bunları ek sıfat olarak ayrıca seçmeyin.',
    '',
  )
  vocabulary.facets.forEach((f, fi) => {
    p(
      `### 4.${fi + 1}. ${f.name} (\`${f.key}\`)`,
      '',
      `**Soru:** ${f.question}`,
      '',
      `En çok **${f.max}** değer${f.multi ? '' : ' (tek seçim)'}${f.slot ? ` · mikro tür adında **${SLOT_TEXT[f.slot]}** olarak kullanılır` : ''}.`,
      '',
      '| Değer | Anahtar | Ne zaman seçilir | Addaki ifade |',
      '| --- | --- | --- | --- |',
    )
    for (const v of f.values)
      p(
        `| ${cell(v.name)} | \`${v.key}\` | ${cell(v.description ?? '—')} | ${v.phrase ? `"${cell(v.phrase)}"` : '—'} |`,
      )
    p('')
  })

  /* ── Adlandırma ── */
  const order = vocabulary.naming.order.map((s) => SLOT_TEXT[s] ?? s).join(' → ')
  p(
    '## 5. Mikro tür adları nasıl kurulur',
    '',
    'Etiketleyici ad yazmaz; ad, fişlerden otomatik kurulur. Yine de seçimlerinizin nereye gittiğini bilmek işe yarar:',
    '',
    `- Ad, hazır ifadelerin şu sırayla dizilmesidir, sonda çekirdek türün çoğul adı gelir: ${order} → tür.`,
    '- Köken bölgesi ve yapım dönemi künyeden (ülke ve yıl) gelir; fişte seçilmez.',
    '- Kişi (oyuncu, yönetmen, sunucu) katalogda en az iki yapımda geçiyorsa kendi mikro türünü alır ("Buster Keaton Komedi Filmleri").',
    '- Tür adında zaten söylenen nitelik ada eklenmez ("Komik Komediler" oluşmaz); biri ötekini söyleyen iki nitelik',
    '  ("Sessiz" ve "Diyalogsuz") aynı adda birleşmez.',
    "- Aynı başlıkları kapsayan iki ad varsa daha sade olanı kalır: bütün sessiz komediler 1920'lerdense",
    '  "1920\'lerden Sessiz Komedi Filmleri" değil "Sessiz Komedi Filmleri" görünür.',
    '',
    'Örnek tür adları:',
    '',
    '| Tür | Film | Dizi | Karışık |',
    '| --- | --- | --- | --- |',
  )
  for (const [g, nn] of Object.entries(vocabulary.naming.genreNouns))
    p(`| ${GENRES[g as keyof typeof GENRES]?.name ?? g} | ${nn.movie} | ${nn.show} | ${nn.mixed} |`)
  p('')

  /* ── Örnekler ── */
  p(
    '## 6. İşlenmiş örnekler',
    '',
    'Aşağıdaki iki fiş depodaki **örnek** fişlerdir: yapım izlenmeden, özet ve künyeden doldurulmuştur. Bu yüzden izlemeden bilinemeyecek',
    'ölçekler boş bırakılmış ve her seviyenin dayanağı nota yazılmıştır. Gerçek fişte bu ölçekleri izleyerek doldurursunuz.',
    '',
  )
  examples.forEach((ex, i) => {
    const s = ex.sheet
    p(`### 6.${i + 1}. ${ex.title} (${ex.year}, ${ex.type === 'MOVIE' ? 'film' : 'dizi'})`, '')
    p('| Ölçek | Seviye |', '| --- | --- |')
    for (const sc of vocabulary.scales) {
      const v = s.scales[sc.key]
      p(`| ${sc.name} | ${typeof v === 'number' ? `${v} — ${cell(sc.levels[v]?.label ?? '')}` : 'boş bırakıldı'} |`)
    }
    p('')
    const facetLines = vocabulary.facets
      .filter((f) => (s.facets[f.key] ?? []).length > 0)
      .map((f) => {
        const vals = s.facets[f.key]!.map((k) => f.values.find((x) => x.key === k)?.name ?? k)
        return `- **${f.name}:** ${vals.join(', ')}`
      })
    if (facetLines.length) p('Yüzler:', '', ...facetLines, '')
    const scales: Record<string, number> = {}
    for (const [k, v] of Object.entries(s.scales)) if (typeof v === 'number') scales[k] = v
    const desc = descriptorsOf(index, scales).map((k) => index.descriptors.get(k)?.adjective ?? k)
    p(`Bu fişten çıkan sıfatlar: ${desc.length ? desc.map((d) => `"${d}"`).join(', ') : 'yok'}.`, '')
    if (s.notes) p(`> **Not:** ${s.notes}`, '')
  })

  p(
    '## 7. Sık yapılan hatalar',
    '',
    '- Tür etiketine bakarak seviye seçmek ("korku filmi, demek ki korku 5"). Seviye ekranda görülene göre seçilir.',
    '- Tek bir sahne yüzünden ton ölçeklerini yükseltmek. Tek sahne yalnız içerik uyarılarında belirleyicidir.',
    '- Yapım yılı ile hikâyenin dönemini karıştırmak. 2020 yapımı bir dizi 1970\'lerde geçebilir; "Hikâyenin dönemi" olayların zamanıdır.',
    '- Belgeselde "Kaynak: Gerçek olay" seçmek. Bu değer, gerçek bir olayı canlandıran kurgu yapımlar içindir.',
    '- Bir yüzde sınırı doldurmak için zayıf değerler eklemek. Az ama doğru değer, çok ama belirsiz değerden iyidir.',
    '- Emin olunmayan bir ölçeğe orta değer (2–3) yazmak. Bilmiyorsanız boş bırakın ve notta nedenini yazın.',
    '',
  )
  return L.join('\n')
}

/** Depodaki örnek fişlerden kılavuz örneklerini seçer. */
export function pickExamples(contentDir: string, sheets: TagSheet[]): GuideExample[] {
  const titles = new Map<number, { title: string; year: number; type: 'MOVIE' | 'SHOW' }>()
  for (const file of titleFiles(contentDir)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      const r = zTitle.safeParse(item)
      if (r.success) titles.set(r.data.videoId, { title: r.data.title, year: r.data.year, type: r.data.type })
    }
  }
  const usable = sheets.filter((s) => titles.has(s.titleId))
  const chosen = PREFERRED_EXAMPLES.map((id) => usable.find((s) => s.titleId === id)).filter((s): s is TagSheet => !!s)
  for (const s of usable) if (chosen.length < 2 && !chosen.includes(s)) chosen.push(s)
  return chosen.map((sheet) => ({ ...titles.get(sheet.titleId)!, sheet }))
}

/** Kılavuzun son hâli: deponun prettier ayarlarıyla biçimlenmiş (`npm run format` dosyayı değiştirmesin diye). */
export async function buildGuide(contentDir: string): Promise<string> {
  const content = loadTaggingContentOrThrow(contentDir)
  const md = renderGuide(
    content.vocabulary,
    pickExamples(
      contentDir,
      content.sheets.map((s) => s.sheet),
    ),
  )
  const options = (await prettier.resolveConfig(GUIDE_FILE)) ?? {}
  return prettier.format(md, { ...options, parser: 'markdown', filepath: GUIDE_FILE })
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] ?? defaultContentDir()
  const out = process.argv[3] ?? GUIDE_FILE
  writeFileSync(out, await buildGuide(dir))
  console.log(`Kılavuz yazıldı: ${out}`)
}
