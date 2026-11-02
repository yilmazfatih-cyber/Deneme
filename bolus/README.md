# Bölüş — ev içi ortak harcama

Splitwise'ın temel özelliklerini taşıyan, kurulumsuz ve sunucusuz bir web uygulaması.
Ev arkadaşları, aile ya da tatil grubu için: kim ne ödedi, kim kime ne kadar borçlu.

**Adres:** `https://<kullanıcı>.github.io/<depo>/bolus/` (GitHub Pages iş akışı `bolus/` klasörünü olduğu gibi yayınlar).
Telefonda açıp "Ana ekrana ekle" deyince kendi simgesiyle, internetsiz çalışır.

## Özellikler

| Alan       | Neler var                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Gruplar    | Birden fazla grup (Ev, Yazlık, Tatil…), grup başına para birimi (TRY, EUR, USD, GBP)                                |
| Kişiler    | Ekle / yeniden adlandır / sil; "ben" işaretiyle harcamalar size göre borç/alacak olarak görünür                     |
| Harcama    | Açıklama, tutar, tarih, kategori, not; tek ödeyen veya **birden fazla ödeyen**                                      |
| Bölüşme    | **Eşit**, **tam tutar**, **yüzde**, **hisse**; artan kuruşlar en büyük kalan yöntemiyle dağıtılır, toplam hep tutar |
| Bakiyeler  | Kişi başı net bakiye; **sadeleştirilmiş borçlar** (en az ödeme) veya **kişi kişiye** görünüm                        |
| Ödeşme     | "Ödendi" ile tek dokunuşta ödeme kaydı; ödeme kayıtları bakiyeyi kapatır                                            |
| Düzenleme  | Her kayıt düzenlenir ve silinir; silme "Geri al" ile geri gelir                                                     |
| Arama      | Açıklama, kişi, kategori ve nota göre filtre; aylara göre liste                                                     |
| Paylaşım   | Grup verisi sıkıştırılıp **bağlantıya** gömülür; WhatsApp'tan gönderin, alan kişi "Telefonuma al" der               |
| Yedek      | Tüm grupları `.json` olarak indir / yükle (üzerine yaz veya birleştir); grup başına `.csv` dışa aktarma             |
| Çevrimdışı | Service worker ile ilk açılıştan sonra internetsiz çalışır; veri yalnızca tarayıcının localStorage'ında             |

## Veriler nasıl paylaşılır?

Sunucu olmadığı için cihazlar kendiliğinden eşitlenmez. Akış şöyle:

1. Harcamaları giren kişi **Ayarlar → Paylaşım bağlantısı** der; bağlantı panoya kopyalanır (telefonda paylaşım menüsü açılır).
2. Bağlantıyı evdekilere gönderir. Açan kişi kendini seçer, **Telefonuma al** der.
3. Daha sonra iki taraf da değişiklik yaptıysa **Birleştir** seçilir: aynı kayıtta son güncellenen kazanır, yeni kayıtlar birleşir,
   silinen kayıtlar karşı tarafta da silinir.

Pratikte en kolayı: harcamaları tek kişi girer, haftada bir bağlantı atar. Herkes kendi telefonunda "ben"i seçince
listede kendi borç/alacağını görür.

## Geliştirme

Derleme yok. Klasörü herhangi bir statik sunucuyla açın (ES modülleri `file://` ile çalışmaz):

```bash
npx serve bolus
```

Hesap mantığı `hesap.mjs` dosyasında saf fonksiyonlardır; testleri:

```bash
node --test bolus/hesap.test.mjs
```

İçe aktarılan her veri (yedek, bağlantı, localStorage) `normalizeGroup` ile doğrulanır: geçersiz kimlik, tarih, para birimi
ve tutarı tutmayan kayıtlar atılır.

Dosyalar: `index.html` (kabuk ve stil) · `app.mjs` (ekranlar, depolama, paylaşım) · `hesap.mjs` (bölüşme, bakiye, sadeleştirme) ·
`sw.js` (çevrimdışı) · `manifest.webmanifest` · `icon.svg`.
