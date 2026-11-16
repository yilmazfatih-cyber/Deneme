---
baslik: Küçük model için hazır istem şablonları
ozet: Sınıflandırma, çok etiketli işaretleme, bölüm özeti ve birleştirme, sadeleştirme, çeviri, karar ve e-posta taslağı için kopyalanacak Türkçe şablonlar; şablonu güvenle doldurma ve çıktıda ne denetleneceği.
etiketler: [llm, istem, sablon, kucuk-model, siniflandirma, ozetleme]
duzey: temel
guncellik: 2026-11
---

# Küçük model için hazır istem şablonları

> Bu notu ne zaman okumalı: Küçük bir modele sık görülen bir işi (sınıflandırma, özet, sadeleştirme, çeviri, karar,
> e-posta taslağı) yaptıracakken sıfırdan istem yazmak yerine. Çıkarım, belgeye soru, ajan ve hakem şablonları
> havuzda hazırdır: `yz/yz/istem/sablonlar.py`. Kuralların gerekçesi: [Küçük modeller için istem](kucuk-modeller-icin-istem.md).

## Temel fikir

Şablonlar aynı iskeleti izler: **tek görev** → **tanımlar** (etiket, alan, okur) → **ayraçlı veri** → **numaralı
kısa kurallar** → **en sonda çıktı biçimi**. Değişken yerler `{ad}` biçimindedir; şablonda kalan süslü ayraçlar (JSON
örneği) `{{ }}` diye ikilenir. Şablon tek başına güvence değildir: her şablonun altında çıktıda neyin kodla
denetleneceği yazar. Şablonu kendi işinize uyarladıktan sonra görev kümesinde ölçün ve sürümleyin
([değerlendirme](degerlendirme.md)).

## Karar tablosu

| Görev                                   | Şablon                         | Çıktıda kodla denetle                                   | Havuzda hazır karşılığı                |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------- | -------------------------------------- |
| Tek etiket (talep türü, öncelik)        | Sınıflandırma                  | Tek ve izinli etiket; dağılım                            | `yz/gorevler/siniflandirma.yaml` istemi |
| Birden çok konu işaretleme              | Çok etiketli                   | JSON dizi; izinli değerler; boş dizi izni                | —                                      |
| Metinden alan çıkarma                   | Çıkarım                        | Şema, Türkçe sayı/tarih, içerik denetçisi                | `cikarim_kullanici`, `alan_sorusu`     |
| Belgeye dayalı yanıt                    | Belgeye soru                   | Atıf, dayanaksız rakam/ad, "yok" tanıma                  | `rag_sistem`, `rag_kullanici`          |
| Uzun belge özeti                        | Bölüm özeti + birleştirme      | Rakamlar kaynakta; her bölümden bilgi                    | depodaki `ozetci` istemleri            |
| Metni sadeleştirme / yeniden yazma      | Sadeleştirme                   | Rakam ve adlar korunmuş; uzunluk                         | —                                      |
| Çeviri                                  | Çeviri                         | Rakam, biçim, terim sözlüğü                              | —                                      |
| Kurallara göre karar                    | Karar                          | JSON; karar izinli; gerekçe kurala atıf yapıyor          | —                                      |
| Yanıt e-postası taslağı                 | E-posta taslağı                | Eksik bilgi işaretleri; insan onayı                      | —                                      |
| Çıktıyı ölçüte göre puanlama            | Hakem                          | Yalnız EVET/HAYIR; hakemin kendi doğruluğu               | `hakem`                                |

## Şablonu güvenle doldurma

Üç klasik hata: şablonda doldurulmamış alan kalması, yanlış yazılmış alan adı (sessizce yok sayılır) ve verinin
içinde ayracın geçmesi (veri talimata karışır). Hepsini modele göndermeden yakalayın.

```python calistir
import string

CIKARIM = '''Metinden bilgi çıkar.
ALANLAR:
- siparis_no (metin): sipariş numarası
- sehir (metin ya da null): teslimat şehri
METİN:
"""
{metin}
"""
Metinde olmayan alan için null yaz.
Yalnızca JSON yaz. Biçim: {{"siparis_no": "...", "sehir": "..."}}'''  # JSON'daki süslü ayraçlar ikilenir


def doldur(sablon: str, **degerler: str) -> str:
    """Eksik/fazla değişkeni ve ayraç çakışmasını modele göndermeden ÖNCE yakalar."""
    alanlar = {ad for _, ad, _, _ in string.Formatter().parse(sablon) if ad}
    if eksik := alanlar - degerler.keys():
        raise KeyError(f"şablonda doldurulmamış alan: {sorted(eksik)}")
    if fazla := degerler.keys() - alanlar:
        raise KeyError(f"şablonda olmayan alan verildi (yazım hatası mı?): {sorted(fazla)}")
    for ad, deger in degerler.items():
        if '"""' in deger:
            raise ValueError(f"'{ad}' içinde ayraç (\"\"\") geçiyor: veri talimata karışır; ayracı değiştirin")
    return sablon.format(**degerler)  # değerin içindeki { } yeniden yorumlanmaz


istem = doldur(CIKARIM, metin="Kolim {S-12} nerede? Ankara'ya gelecekti.")
print(istem.splitlines()[-1])
assert "Kolim {S-12} nerede?" in istem  # kullanıcı metnindeki süslü ayraç bozulmadı
for hatali in ({}, {"metin": "x", "metn": "y"}, {"metin": 'a """ b'}):
    try:
        doldur(CIKARIM, **hatali)
    except (KeyError, ValueError) as hata:
        print("yakalandı:", hata)
```

```cikti
Yalnızca JSON yaz. Biçim: {"siparis_no": "...", "sehir": "..."}
yakalandı: "şablonda doldurulmamış alan: ['metin']"
yakalandı: "şablonda olmayan alan verildi (yazım hatası mı?): ['metn']"
yakalandı: 'metin' içinde ayraç (""") geçiyor: veri talimata karışır; ayracı değiştirin
```

Kullanıcı verisini şablona **değişken olarak** verin; şablon metnine yapıştırıp sonra `format` çağırmayın (verideki
`{` hata ya da yer tutucu üretir). Havuzdaki şablon deposu her şablonu iki dilde aynı değişkenlerle tutar ve bunu
testle korur (`yz/tests/test_istem.py`).

## Şablonlar

### Sınıflandırma (tek etiket)

```text
Müşteri mesajını sınıflandır.
Etiketler:
{etiket_tanimlari}
Kurallar:
1. Yalnızca mesajın içeriğine bak.
2. Hiçbir etikete uymuyorsa ya da emin değilsen "diger" yaz.
Mesaj:
"""
{mesaj}
"""
Yalnızca etiketi yaz.
```

`etiket_tanimlari` her satırda `- etiket: bir cümlelik tanım`. Denetim: çıktıyı Türkçe kuralla küçültüp izinli kümeye
indirin; iki etiket geçiyorsa kabul etmeyin ([küçük modeller için istem](kucuk-modeller-icin-istem.md)
`etiket_coz`). Etiket dağılımını raporlayın: gerçek denemede 0,5B model yanıtların yarısına yakınını tek etikete yığdı.

### Çok etiketli işaretleme

```text
Yorumda geçen konuları işaretle.
Konular: {konular}
Kurallar:
1. Yalnızca yorumda açıkça geçen konuları seç.
2. Hiçbir konu geçmiyorsa boş liste yaz.
Yorum:
"""
{yorum}
"""
Yalnızca JSON dizi yaz. Örnek: ["kargo", "fiyat"] ya da []
```

Denetim: JSON dizi mi; her öğe izinli mi (değilse at, notunu düş); yinelenen öğe. Örnekteki değerleri sürekli
kopyalıyorsa örneği konu listesinde olmayan bir biçimde gösterin (`["konu1", "konu2"]`).

### Bölüm özeti ve birleştirme (uzun belge)

```text
Aşağıdaki bölümü en çok {azami_cumle} cümlede özetle.
Kurallar:
1. Bütün rakamları, tarihleri ve adları aynen koru.
2. Yorum ve değerlendirme ekleme; yalnız bölümdeki bilgiyi yaz.
Bölüm:
"""
{bolum}
"""
Yalnızca özeti yaz, düz metin.
```

```text
Aşağıdaki bölüm özetlerini tek bir özette birleştir.
Kurallar:
1. Her bölümden en az bir bilgi kalsın.
2. Rakamları aynen koru; yeni rakam hesaplama.
3. Bölümler çelişiyorsa ikisini de yaz.
Bölüm özetleri:
"""
{bolum_ozetleri}
"""
Çıktı: en çok {azami_madde} madde, her madde "- " ile başlasın.
```

Denetim: özetteki rakamlar kaynakta var mı; madde sayısı; her bölümden bir bilgi geçiyor mu
([belge notu](cok-modlu-ve-belge.md)).

### Sadeleştirme / yeniden yazım

```text
Metni şu okur için yeniden yaz: {okur}.
Kurallar:
1. Her cümle en çok {azami_sozcuk} sözcük olsun.
2. Rakamları, tarihleri, adları ve tutarları aynen koru.
3. Metinde olmayan bilgi ekleme; anlamı değiştirme.
4. Yetişkin ve saygılı bir dil kullan.
Metin:
"""
{metin}
"""
Yalnızca yeniden yazılmış metni yaz.
```

Denetim: kaynakla çıktının rakam kümeleri aynı mı; cümle uzunluğu sınırı; çıktı kaynaktan çok uzun mu (ekleme
belirtisi). `{okur}` örnekleri: "ilk kez başvuran yetişkin", "teknik bilgisi olmayan müşteri".

### Çeviri

```text
Metni {hedef_dil} diline çevir.
Kurallar:
1. Şu terimleri sözlükteki gibi çevir: {terim_sozlugu}
2. Rakam, tarih, para birimi, e-posta, bağlantı ve kodları değiştirme.
3. Biçimi (başlık, madde, satır sonu) koru.
Metin:
"""
{metin}
"""
Yalnızca çeviriyi yaz.
```

Denetim: rakam/bağlantı kümeleri kaynakla aynı mı; sözlük terimleri doğru mu; madde ve satır sayısı yakın mı.
Küçük model uzun metinde dili karıştırabilir: paragraf paragraf çevirin.

### Karar (kurallara göre)

```text
Talebi aşağıdaki kurallara göre değerlendir.
Kurallar:
{kurallar}
Talep:
"""
{talep}
"""
Önce hangi kurala dayandığını yaz, sonra kararı ver.
Yalnızca JSON yaz. Biçim: {{"dayandigi_kural": "...", "karar": "onay|ret|insana_sor"}}
```

Denetim: `karar` izinli değerlerden biri mi; `dayandigi_kural` verilen kurallardan birini anıyor mu; emin olunmayan
durum için `insana_sor` seçeneği var. Tutarı, tarihi ve eşiği **kod** karşılaştırsın, model yalnız gerekçe ve
sınıflandırma yapsın. Geri alınamaz kararlar insan onayından geçer.

### E-posta yanıt taslağı

```text
Müşteri e-postasına yanıt taslağı yaz.
Bilinenler:
{bilinenler}
Kurallar:
1. Yalnızca "Bilinenler" bölümündeki bilgiyi kullan.
2. Bilinmeyen bir bilgi gerekiyorsa yerine [BİLGİ GEREKLİ: ...] yaz.
3. En çok {azami_cumle} cümle; nazik ve yalın Türkçe.
E-posta:
"""
{eposta}
"""
Yalnızca taslak metnini yaz.
```

Denetim: `[BİLGİ GEREKLİ` işaretleri kaldıysa taslak gönderilmez; rakam ve tarihler "Bilinenler"de var mı; gönderme
her zaman insan onayıyla ([ajanlar ve araçlar](ajanlar-ve-araclar.md)).

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `KeyError` ya da istemde `{metin}` yazısı kalmış               | Değişken doldurulmadı / adı yanlış yazıldı              | Doldurmadan önce alan denetimi (yukarıdaki `doldur`)        |
| JSON örneği istemde tek süslü ayraçla bozuk çıktı              | `{ }` ikilenmedi                                        | Şablondaki JSON'da `{{ }}`                                  |
| Kullanıcı metni talimat gibi uygulandı                         | Ayraç verinin içinde de geçiyordu                       | Ayraç çakışması denetimi; başka ayraç                       |
| Model örnekteki değeri her yanıta yazıyor                      | Örnek değer gerçek sanıldı                              | Örneği nötr yazın; seçenekleri birlikte gösterin            |
| Şablon başka modelde bozuk sonuç veriyor                       | Şablon bir modele göre ayarlanmıştı                     | Model değişince görev kümesini yeniden koşun                |
| Yanıt İngilizce geldi                                          | Çıktı dili yazılmadı, veri İngilizceydi                 | "Türkçe yaz" ya da hedef dili açıkça yazın                  |
| Şablon "iyileştirildi", eski sonuçlar açıklanamıyor           | Şablon sürümlenmedi                                     | Şablon + model + şema birlikte sürümlenir ([üretim](uretim-hatti-kaliplari.md)) |

## Denetim listesi

- [ ] Şablon tek görev, tanımlar, ayraçlı veri, numaralı kurallar ve en sonda çıktı biçimi içeriyor.
- [ ] Eksik bilgi davranışı tanımlı (`diger`, boş liste, `null`, `[BİLGİ GEREKLİ: ...]`, `insana_sor`).
- [ ] Şablon değişkenleri doldurulmadan önce denetleniyor; JSON örneğindeki ayraçlar ikili.
- [ ] Veri değişken olarak veriliyor; ayraç çakışması denetleniyor.
- [ ] Her şablonun altında yazan çıktı denetimi kodda var.
- [ ] Şablon görev kümesinde ölçüldü ve sürümlendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu nottaki ilgili şablonu kopyala; yalnız `{...}` alanlarını ve etiket/kural listelerini değiştir.
  Kural ekleme. Şablonun altındaki denetimi kodla yaz."
- **Modelin tipik hatası:** şablonu "geliştirip" uzatmak; biçim satırını ortaya taşımak; JSON örneğindeki ayraçları
  ikilemeyi unutmak; denetim kodunu atlamak; aynı şablonu başka iş için zorlamak.
- **Çıktıda denetleyin:** şablon ile kopyası arasındaki fark (yalnız değişkenler mi değişti?); `doldur` benzeri bir
  denetim var mı; çıktı denetimi yazılmış mı.

## İlgili

- [İstem mühendisliği](istem-muhendisligi.md) · [Küçük modeller için istem](kucuk-modeller-icin-istem.md) ·
  [Yapılı çıktı](yapili-cikti.md) · [Görev bölme ve zincirler](gorev-bolme-ve-zincirler.md)
- Havuzdaki şablon deposu: [`sablonlar.py`](../../yz/yz/istem/sablonlar.py) (çıkarım, alan sorusu, belgeye soru, ajan,
  özet, hakem; Türkçe ve İngilizce), iki dilde aynılık testi [`test_istem.py`](../../yz/tests/test_istem.py)
