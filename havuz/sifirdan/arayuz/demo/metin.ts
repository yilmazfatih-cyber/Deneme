// Gösterimlerin kodla ürettiği Türkçe metinler tek sözlükte. Sayfaların durağan metni HTML'dedir (sayfa bir
// belgedir); betiklerin oluşturduğu iletiler (durum, hata, düğme adı) buradan gelir.
// Genişletme: yeni gösterim için bu nesneye kendi bölümünü (`<ad>: { … }`) ekleyin.

export const metin = {
  sinyal: {
    toplam: (n: string) => `Toplam: ${n}`,
    hesap: (n: number) => `${n} kez hesaplandı`,
    etki: (n: number, deger: string) => `Etki ${n}. kez çalıştı → ${deger}`,
  },
  sanal_dom: {
    bos: 'Liste boş. Yukarıdan bir görev ekleyin.',
    sayac: (kalan: number, toplam: number) => `${toplam} görevden ${kalan} tanesi bekliyor`,
    islem: (ekleme: number, olusturma: number, silme: number) =>
      `Son güncellemede DOM: ${ekleme} yerleştirme, ${olusturma} oluşturma, ${silme} silme`,
    sil: (gorev: string) => `"${gorev}" görevini sil`,
    yukari: (gorev: string) => `"${gorev}" görevini yukarı taşı`,
    tamam: (gorev: string) => `"${gorev}" tamamlandı`,
    hata: 'Görev metni boş olamaz.',
  },
  yonlendirici: {
    yukleniyor: (yol: string) => `Yükleniyor: ${yol}`,
    bulunamadi: 'Bu sayfa bulunamadı.',
    girisGerekli: 'Yönetim sayfası için giriş yapın.',
    girisYapildi: 'Giriş yapıldı',
    cikisYapildi: 'Çıkış yapıldı',
    yuklemeHatasi: (hata: string) => `Veri yüklenemedi: ${hata}`,
  },
  depo: {
    adim: (i: number, n: number) => `Adım ${i} / ${n}`,
    eşitlendi: 'Başka bir sekmeden güncellendi',
    kayitYuklenemedi: (sebep: string) => `Kayıt yüklenemedi (${sebep}); boş listeyle başlandı.`,
    bos: 'Henüz not yok.',
  },
  form: {
    adim: (i: number, n: number, ad: string) => `Adım ${i} / ${n}: ${ad}`,
    denetleniyor: 'Kullanıcı adı denetleniyor…',
    alinmis: 'Bu kullanıcı adı alınmış. Başka bir ad deneyin.',
    gonderildi: 'Kayıt tamamlandı. Teşekkürler!',
    hataOzeti: (n: number) => `${n} alanda düzeltme gerekiyor.`,
    telefon: (i: number) => `Telefon ${i}`,
    telefonSil: (i: number) => `Telefon ${i} alanını sil`,
  },
  tablo: {
    hucre: (adres: string, deger: string) => `${adres}: ${deger || 'boş'}`,
    hesaplanan: (n: number, toplam: number) => `Son değişiklikte ${n} hücre yeniden hesaplandı (toplam ${toplam}).`,
    yapistirildi: (n: number) => `${n} hücre yapıştırıldı.`,
  },
  duzenleyici: {
    konum: (satir: number, sutun: number, secim: number) => `Satır ${satir}, sütun ${sutun} · ${secim} seçim`,
    bulundu: (n: number) => (n === 0 ? 'Eşleşme yok' : `${n} eşleşme`),
    degisti: (n: number) => `${n} yer değiştirildi`,
    hataliIfade: (ileti: string) => ileti,
  },
  oyun: {
    durum: (tohum: number, toplam: number, can: number, sure: string) =>
      `Tohum ${tohum}/${toplam} · Can ${can} · Süre ${sure} sn`,
    kazandi: (sure: string) => `Kazandın! Kaynağa ${sure} saniyede ulaştın.`,
    kaybetti: 'Damla buharlaştı. Yeniden dene!',
    kaynakAcildi: 'Tüm tohumlar toplandı: kaynak açıldı!',
    tohum: 'Tohum toplandı',
    hasar: 'Kor değdi: can azaldı',
    tekrar: (ozet: string) => `Tekrar oynatılıyor. Canlı oyunun durum özeti ${ozet}`,
    tekrarBitti: (ayni: boolean) =>
      ayni ? 'Tekrar bitti: durum özeti canlı oyunla birebir aynı.' : 'Tekrar bitti: özet farklı!',
    duraklatildi: 'Duraklatıldı',
  },
  isin: {
    ilerleme: (yuzde: number) => `%${yuzde}`,
    bitti: (ms: number) => `Bitti: ${Math.round(ms)} ms`,
    basladi: 'Çiziliyor…',
  },
  grafik: {
    tema: (koyu: boolean) => (koyu ? 'Açık temaya geç' : 'Koyu temaya geç'),
  },
  paketleyici: {
    ozet: (dahil: number, atilan: string, tutulan: number, toplam: number) =>
      `${dahil} modül dahil, ${tutulan}/${toplam} deyim tutuldu. Atılan modüller: ${atilan || 'yok'}.`,
    sonuc: (deger: string) => `Sonuç: ${deger}`,
    hata: (ileti: string) => `Hata: ${ileti}`,
    dongu: (yol: string) => `Döngü: ${yol}`,
  },
  sanal_liste: {
    cizilen: (n: number, toplam: number) => `DOM'da ${n} öğe var (toplam ${toplam.toLocaleString('tr-TR')} mesaj).`,
  },
  animasyon: {
    yay: (zeta: string, sure: string) => `Sönüm oranı ζ = ${zeta} · durulma ≈ ${sure} sn`,
    hareket: (azalt: boolean) => (azalt ? 'Hareket azaltılmış' : 'Hareket açık'),
  },
} as const
