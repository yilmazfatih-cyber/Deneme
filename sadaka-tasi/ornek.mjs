// Sadaka Taşı — demo verisi. Gerçek kişi ve kurum yoktur. Sandık, kurallar.mjs ile Eylül 2025'ten bugüne
// ay ay çalıştırılarak üretilir; aynı tohumla her seferinde aynı sonuç çıkar.
import { yeniDurum, uyeEkle, talepOlustur, talepKararVer, ayiKapat, TL, VARSAYILAN_KURALLAR } from './kurallar.mjs'

export const DEMO_BASLANGIC = '2025-09'
export const DEMO_BUGUN = '2026-11'

/** Tek tek izlenmeyen diğer üyeler (toplu modellenir). */
const TOPLULUK = {
  uyeSayisi: 140,
  buyume: 0.17,
  ortalamaPay: TL(320),
  yillikTalepOrani: 0.09,
  ortalamaTalep: TL(6500),
  alanDagilimi: { acil: 0.32, gida: 0.2, egitim: 0.18, saglik: 0.14, barinma: 0.1, afet: 0.06 },
}

/** Kurul panelinde ve "örnek üyeyle gez" seçeneğinde görünen üyeler. İlki örnek hesaptır. */
const UYELER = [
  { ay: '2025-09', sehir: 'Kayseri', aylikPay: TL(500), alan: 'egitim' },
  { ay: '2025-10', sehir: 'Hatay', aylikPay: TL(250), alan: 'afet' },
  { ay: '2025-12', sehir: 'İzmir', aylikPay: TL(400), alan: 'saglik' },
  { ay: '2026-02', sehir: 'Ankara', aylikPay: TL(300), alan: 'gida' },
  { ay: '2026-04', sehir: 'Bursa', aylikPay: TL(1000), alan: 'acil' },
  { ay: '2026-06', sehir: 'Konya', aylikPay: TL(200), alan: 'barinma' },
  { ay: '2026-08', sehir: 'Trabzon', aylikPay: TL(350), alan: 'gida' },
]

const OLAYLAR = [
  {
    ay: '2026-03',
    uye: 0,
    kategori: 'saglik',
    tutar: TL(4800),
    aciklama: 'Annemin katarakt ameliyatı için hastanenin istediği fark ücreti.',
    belgeler: ['hastane-fark-faturasi.pdf', 'goz-raporu.pdf'],
    odemeYeri: 'kurum',
    karar: { tur: 'onay' },
  },
  {
    ay: '2026-07',
    uye: 1,
    kategori: 'afet',
    tutar: TL(3500),
    aciklama: 'Sel suyu evin alt katını bastı; buzdolabı ve çamaşır makinesi kullanılamaz durumda.',
    belgeler: ['muhtarlik-hasar-tespiti.pdf', 'hasar-fotograflari.zip'],
    odemeYeri: 'kendim',
    karar: { tur: 'onay', tutar: TL(3000) },
  },
  {
    ay: '2026-08',
    uye: 2,
    kategori: 'kaza',
    tutar: TL(2000),
    aciklama: 'İş yerinde düşüp bileğimi kırdım; ortez ve fizik tedavi giderleri.',
    belgeler: ['acil-servis-kaydi.pdf'],
    odemeYeri: 'kurum',
    karar: { tur: 'onay' },
  },
  {
    ay: '2026-09',
    uye: 3,
    kategori: 'diger',
    tutar: TL(1500),
    aciklama: 'Telefonumun ekranı kırıldı, yenisini almam gerekiyor.',
    belgeler: [],
    odemeYeri: 'kendim',
    karar: { tur: 'red', gerekce: 'Talep, sandığın kara gün türlerinden birine uymuyor.' },
  },
  {
    ay: '2026-11',
    uye: 2,
    kategori: 'cenaze',
    tutar: TL(7500),
    aciklama: 'Babamı kaybettik. Defin ve memlekete nakil masrafları için destek istiyorum.',
    belgeler: ['olum-belgesi-edevlet.pdf', 'cenaze-hizmeti-faturasi.pdf'],
    odemeYeri: 'kurum',
  },
  {
    ay: '2026-11',
    uye: 3,
    kategori: 'is',
    tutar: TL(2400),
    aciklama: 'Çalıştığım atölye kapandı. Yeni iş bulana kadar bu ayın kirasını ödeyemiyorum.',
    belgeler: ['atolye-kapanis-yazisi.jpg'],
    odemeYeri: 'kendim',
    karar: { tur: 'belge', not: "SGK işten ayrılış kaydını e-Devlet'ten barkodlu olarak ekleyin." },
  },
  {
    ay: '2026-11',
    uye: 4,
    kategori: 'saglik',
    tutar: TL(1800),
    aciklama: 'Oğlumun kanal tedavisi; diş hekiminin fiyat teklifi ekte.',
    belgeler: ['dis-hekimi-teklifi.pdf'],
    odemeYeri: 'kurum',
  },
  {
    ay: '2026-11',
    uye: 5,
    kategori: 'onarim',
    tutar: TL(4500),
    aciklama: 'Kombi bozuldu, usta kart değişmeli diyor. Evde iki küçük çocuk var.',
    belgeler: ['usta-teklifi.jpg', 'kombi-ariza-fotografi.jpg'],
    odemeYeri: 'kurum',
  },
]

export function ornekDurum(k = VARSAYILAN_KURALLAR) {
  let s = yeniDurum({ ay: DEMO_BASLANGIC, topluluk: TOPLULUK, tohum: 20250901 }, k)
  const idler = []
  for (;;) {
    UYELER.forEach((u, i) => {
      if (u.ay !== s.ay) return
      const r = uyeEkle(s, u, k)
      s = r.durum
      idler[i] = r.uyeId
    })
    for (const o of OLAYLAR.filter((x) => x.ay === s.ay)) {
      const t = talepOlustur(s, { ...o, uyeId: idler[o.uye] }, k)
      s = t.durum
      if (o.karar) s = talepKararVer(s, t.talepId, o.karar, k)
    }
    if (s.ay === DEMO_BUGUN) return s
    s = ayiKapat(s, k)
  }
}

/** "Örnek üyeyle gez" seçeneğinin hesabı: 15 aydır üye, bir kez destek almış. */
export function ornekUyeId(durum) {
  return durum.uyeler[0]?.id ?? null
}
