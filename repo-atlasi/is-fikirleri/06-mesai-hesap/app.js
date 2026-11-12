/**
 * Arayüz: Vue 3 (global yapı, index.html'de CDN'den) + Bootstrap 5 sınıfları.
 * Şablon index.html içinde (in-DOM template); burada yalnız durum ve davranış var.
 * Vue, test edilebilsin diye parametre olarak verilir: testler küçük bir sahte Vue geçirir.
 */
import {
  GUN_ADLARI,
  VARSAYILAN_AYARLAR,
  bosHafta,
  csvOlustur,
  donemiHesapla,
  haftayiDuzelt,
  ornek996Haftasi,
  saatMetni,
  sayiMetni,
  tarihMetni,
  tlMetni,
} from './motor.js'

const DEPO_ANAHTARI = 'mesai-hesap:v1'
const GUN_MS = 24 * 60 * 60 * 1000

/** Site verisi engelliyse window.localStorage'a erişmek bile hata fırlatır; o zaman depo yok sayılır. */
function yerelDepo() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** localStorage yalnız kolaylık içindir; özel pencerede ya da engellenmişse sessizce devre dışı kalır. */
export function tarayiciDeposu(depo = yerelDepo()) {
  return {
    oku() {
      try {
        return JSON.parse(depo?.getItem(DEPO_ANAHTARI) ?? 'null')
      } catch {
        return null
      }
    },
    yaz(veri) {
      try {
        depo?.setItem(DEPO_ANAHTARI, JSON.stringify(veri))
      } catch {
        // depolama kapalı ya da dolu: hesap yine çalışır
      }
    },
    sil() {
      try {
        depo?.removeItem(DEPO_ANAHTARI)
      } catch {
        // depolama kapalı: silinecek kayıt da yoktur
      }
    },
  }
}

/** Başlangıç durumu. Bu durum hiç saklanmaz: kayıt yalnız kullanıcı bir şeyi değiştirince oluşur. */
export function varsayilanDurum() {
  return { ayarlar: { ...VARSAYILAN_AYARLAR, aylikBrut: 30000 }, haftalar: [bosHafta()] }
}

/** Kayıttaki ayarlardan yalnız bilinen alanları alır (eski ya da yabancı alanlar taşınmaz). */
function bilinenAyarlar(kayit) {
  const ayarlar = kayit?.ayarlar && typeof kayit.ayarlar === 'object' ? kayit.ayarlar : {}
  return Object.fromEntries(
    Object.keys(VARSAYILAN_AYARLAR)
      .filter((k) => k in ayarlar)
      .map((k) => [k, ayarlar[k]]),
  )
}

export function uygulama(Vue, depo = tarayiciDeposu()) {
  const { computed, reactive, ref, watch } = Vue
  return {
    setup() {
      const kayit = depo.oku()
      const ilk = varsayilanDurum()
      const ayarlar = reactive({ ...ilk.ayarlar, ...bilinenAyarlar(kayit) })
      const kayitliHaftalar = Array.isArray(kayit?.haftalar) && kayit.haftalar.length ? kayit.haftalar : ilk.haftalar
      const haftalar = ref(kayitliHaftalar.map(haftayiDuzelt))
      const secili = ref(0)
      const sonuc = computed(() => donemiHesapla(haftalar.value, ayarlar))
      const varsayilanMetin = JSON.stringify(varsayilanDurum())

      function kaydet() {
        const durum = { ayarlar: { ...ayarlar }, haftalar: haftalar.value }
        if (JSON.stringify(durum) === varsayilanMetin) depo.sil()
        else depo.yaz(durum)
      }
      watch([haftalar, () => ({ ...ayarlar })], kaydet, { deep: true })

      function haftaEkle() {
        haftalar.value.push(bosHafta())
        secili.value = haftalar.value.length - 1
      }
      function haftaSil(no) {
        if (haftalar.value.length < 2) return
        haftalar.value.splice(no, 1)
        secili.value = Math.min(secili.value, haftalar.value.length - 1)
      }
      function ornekYukle() {
        haftalar.value = [ornek996Haftasi()]
        secili.value = 0
      }
      function temizle() {
        haftalar.value = [bosHafta()]
        secili.value = 0
      }
      /** Bu tarayıcıdaki kaydı siler ve formu başlangıç durumuna döndürür (başlangıç durumu saklanmaz). */
      function kaydiSil() {
        const soru = 'Bu cihazdaki kayıt silinsin ve form sıfırlansın mı?'
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm(soru)) return
        const bos = varsayilanDurum()
        Object.assign(ayarlar, bos.ayarlar)
        haftalar.value = bos.haftalar
        secili.value = 0
        depo.sil()
      }
      function haftaAraligi(no) {
        const pazartesi = sonuc.value.haftalar[no]?.pazartesi
        return pazartesi == null ? '' : `${tarihMetni(pazartesi)} – ${tarihMetni(pazartesi + 6 * GUN_MS)}`
      }
      function csvMetni() {
        return '\ufeff' + csvOlustur(haftalar.value, sonuc.value) // BOM: Excel UTF-8'i tanısın
      }
      function csvIndir() {
        const url = URL.createObjectURL(new Blob([csvMetni()], { type: 'text/csv;charset=utf-8' }))
        const baglanti = Object.assign(document.createElement('a'), { href: url, download: 'mesai-hesabi.csv' })
        document.body.append(baglanti) // bazı tarayıcılar belgeye eklenmemiş bağlantıyı indirmez
        baglanti.click()
        baglanti.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000) // hemen iptal edilirse indirme yarıda kalabilir
      }

      return {
        GUN_ADLARI,
        ayarlar,
        haftalar,
        secili,
        sonuc,
        haftaEkle,
        haftaSil,
        ornekYukle,
        temizle,
        kaydiSil,
        haftaAraligi,
        csvMetni,
        csvIndir,
        saatMetni,
        sayiMetni,
        tlMetni,
      }
    },
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const kok = document.getElementById('uygulama')
  if (kok && window.Vue) window.Vue.createApp(uygulama(window.Vue)).mount(kok)
  else if (kok) document.getElementById('yuklenemedi')?.removeAttribute('hidden') // CDN'e ulaşılamadı
}
