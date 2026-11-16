---
baslik: RAG tasarımı: belgeye dayalı yanıt
ozet: Ne zaman RAG; yükle-temizle-parçala-dizinle-getir-sırala-bağlam kur-yanıtla hattı; parçalama kararları, Türkçe'ye duyarlı BM25, karma arama, bağlam bütçesi, kaynak gösterme, belgede yok davranışı ve sık başarısızlıklar.
etiketler: [llm, rag, arama, bm25, parcalama, kaynak]
duzey: orta
guncellik: 2026-11
---

# RAG tasarımı: belgeye dayalı yanıt

> Bu notu ne zaman okumalı: Modelin sizin belgelerinize (politika, ürün bilgisi, sözleşme, el kitabı) dayanarak
> yanıt vermesi gerektiğinde; "belgede var ama model bulamıyor" ya da "belgede yok ama model uyduruyor"
> şikâyetinde. Ölçme: [RAG değerlendirme](rag-degerlendirme.md).

## Temel fikir

Getirmeyle güçlendirilmiş üretim (RAG, retrieval-augmented generation): soru geldiğinde belgelerden ilgili parçaları
bulun, numaralayıp isteme koyun, modelden **yalnız bunlara dayanarak** ve kaynak numarasıyla yanıt isteyin. Model
bilgiyi ezberden değil, önündeki metinden okur; bilgi güncellenince yalnız belge değişir. Sorunların çoğu modelde
değil **getirmededir**: doğru parça bağlama girmezse en iyi model de doğru yanıt veremez. İlgili parça yoksa modeli
hiç çağırmayın, "belgede yok" deyin. Belgeler bağlama rahatça sığıyorsa getirme kurmayın, hepsini verin.

## Karar tablosu: RAG mi?

| İhtiyaç                                                     | Seçim                                          | Neden                                              |
| ----------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Özel ya da sık değişen bilgi (fiyat, politika, süre)         | **RAG**                                        | Güncellenir, kaynak gösterir, "yok" diyebilir      |
| Belgelerin toplamı bağlamın küçük bir kısmı (ör. %30'u altı) | Hepsini bağlama koyun                          | Getirme hatası riski yok; daha basit               |
| Tablo/kayıt sorusu: "Mart'ta kaç iade var?", "en pahalı ürün" | Veritabanı sorgusu ya da araç                  | RAG parça getirir, sayamaz ve toplayamaz           |
| Belirli biçim/üslup/davranış                                 | İstem, az-örnek, gerekirse ince ayar           | Bilgi değil davranış sorunu ([ince ayar kararı](ince-ayar-karari.md)) |
| Bütün belgenin özeti                                         | Eşle-indirge özet                              | Getirme parçalı bakar ([belge notu](cok-modlu-ve-belge.md)) |
| Yanıt tek bir belgeden, belge seçilebiliyor                  | Önce belgeyi seçtirin, sonra o belgede arayın  | Arama alanı daralır                                |

## Hat ve her adımın kararı

| Adım             | Karar                                                          | Sık hata                                                        |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Yükle            | Biçime göre okuyucu (txt, md, html, pdf); kodlama (UTF-8, cp1254) | Taranmış PDF'te metin yok; "Ã¼" gibi bozuk kodlama             |
| Temizle          | Üst/alt bilgi, sayfa numarası, satır sonu tirelemesi, görünmez karakter | Her parçada yinelenen alt bilgi aramayı kirletir         |
| Parçala          | Başlığa göre, sonra paragraf/cümle; hedef boy + örtüşme        | Tablo/liste ortadan bölünür; başlıksız parça bağlamını yitirir  |
| Dizinle          | Sözcük dizini (BM25) + gömme (embedding)                        | Türkçe eklerde düz sözcük eşleşmesi kaçırır                     |
| Getir            | k aday (3–8); ilgililik eşiği                                   | Eşik yok: alakasız parça "kaynak" olur                          |
| Yeniden sırala   | İsteğe bağlı: ucuz kural ya da model puanı                      | Her aday için model çağrısı pahalıdır                           |
| Bağlamı kur      | Numaralı, ayraçlı, bütçeli; en ilgili önce                      | Bütçe taşar, son parça kesilir; aynı içerik iki kez             |
| Yanıtla          | "Yalnızca kaynaklara dayan", atıf zorunlu, sabit "yok" cümlesi   | Model kendi bilgisini katar; atıfsız yanıt                      |
| Denetle          | Atıf, dayanaksız rakam/ad, yankı, "yok" tanıma                  | Hiç denetlenmez                                                 |

Havuzdaki tam hat: `yz/yz/rag/` (yükleyici, temizle, parçala, BM25, gömme, dizin, yanıt). Komut satırı:
`python -m yz indeksle KLASOR` ve `python -m yz sor "soru"`.

## Parçalama kararları

| Karar        | Başlangıç değeri                         | Ne zaman değişir                                              |
| ------------ | ---------------------------------------- | ------------------------------------------------------------- |
| Boy          | ~150–400 belirteç (havuz: hedef 220)     | Yanıt çok parçaya dağılıyorsa büyütün; parçalar konu karıştırıyorsa küçültün |
| Örtüşme      | 1 cümle ya da ~%10–15                    | Yanıt cümlesi iki parçanın sınırında kayboluyorsa artırın      |
| Sınır        | Başlık → paragraf → cümle                 | Tablo, liste, madde ve kod bloğu bütün kalmalı                 |
| Başlık yolu  | Parçanın başına "İade › Süre"            | Her zaman: hem arama hem model bağlamı başlıktan yakalar       |
| Kaynak bilgisi | Dosya adı + başlık yolu (+ sayfa)       | Her zaman: atıf ve hata ayıklama için                         |

```python calistir
import re


def parcala(metin: str, hedef_kelime: int = 15, ortusme_cumle: int = 1) -> list[dict]:
    """Markdown'ı başlıklara, bölümü cümlelere göre böler; her parça başlık yolunu taşır."""
    bolumler, yol, govde = [], [], []
    for satir in metin.splitlines() + ["# SON"]:
        if m := re.match(r"(#{1,6})\s+(.*)", satir):
            if " ".join(govde).strip():
                bolumler.append((" › ".join(yol), " ".join(govde).strip()))
            govde, yol = [], yol[: len(m[1]) - 1] + [m[2].strip()]
        else:
            govde.append(satir.strip())
    parcalar = []
    for baslik, govde_metni in bolumler:
        parca: list[str] = []
        for cumle in re.split(r"(?<=[.!?])\s+", govde_metni):
            if parca and len(" ".join(parca + [cumle]).split()) > hedef_kelime:
                parcalar.append({"baslik": baslik, "metin": " ".join(parca)})
                parca = parca[-ortusme_cumle:] if ortusme_cumle else []  # örtüşme: son cümle yeniden
            parca.append(cumle)
        parcalar.append({"baslik": baslik, "metin": " ".join(parca)})
    return parcalar


belge = """# İade
## Süre
Ürünü teslimden itibaren 14 gün içinde iade edebilirsiniz. Süre teslim tarihinde başlar.
Hediye paketli ürünlerde süre 30 gündür. Süre dolduktan sonra iade kabul edilmez.
## Koşullar
Ürün kullanılmamış ve etiketli olmalıdır. İç giyim ürünleri iade edilemez."""

for p in parcala(belge):
    print(f"[{p['baslik']}] {p['metin']}")
p = parcala(belge)
assert p[0]["baslik"] == "İade › Süre" and p[-1]["baslik"] == "İade › Koşullar"
assert p[1]["metin"].startswith(p[0]["metin"].split(". ")[-1])  # örtüşme: önceki parçanın son cümlesi
```

```cikti
[İade › Süre] Ürünü teslimden itibaren 14 gün içinde iade edebilirsiniz. Süre teslim tarihinde başlar.
[İade › Süre] Süre teslim tarihinde başlar. Hediye paketli ürünlerde süre 30 gündür.
[İade › Süre] Hediye paketli ürünlerde süre 30 gündür. Süre dolduktan sonra iade kabul edilmez.
[İade › Koşullar] Ürün kullanılmamış ve etiketli olmalıdır. İç giyim ürünleri iade edilemez.
```

Örnekte boy sözcükle sayıldı; gerçekte belirteçle sayın. Basit cümle bölücü "Dr. Ali", "vb." gibi kısaltmalarda
yanılır; havuzdaki bölücü kısaltma listesi tutar (`yz/yz/metin.py`, `cumlelere_bol`; parçalayıcı
`yz/yz/rag/parcala.py`, `belgeyi_parcala`).

## Anahtar sözcük, gömme ve karma arama

| Arama                       | İyi olduğu                                           | Kötü olduğu                                       |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Anahtar sözcük (BM25)       | Ürün kodu, sayı, özel ad, mevzuat maddesi; açıklanabilir | Eş anlam ("parola" ↔ "şifre"); Türkçe eklerde kök bulunmazsa |
| Gömme (anlamsal vektör)     | Eş anlam, başka sözcükle sorulan soru                | Kod/sayı/ad tam eşleşmesi; çok dilli model gerekir |
| Karma (ikisi + sıra birleştirme) | Varsayılan olarak en güvenlisi                   | İki dizin bakımı                                  |

Türkçe için BM25'te iki şey şarttır: **işaret katlama** ("sifre" = "şifre") ve **kök kırpma** ("iadeyi" → "iade").
Kök kırpmadan "faturanın" ile "fatura" eşleşmez.

```python calistir
import math
import re
from collections import Counter

KATLA = str.maketrans("çğıöşüâî", "cgiosuai")


def belirtecle(metin: str, kok: int = 4) -> list[str]:
    """Türkçe küçült → işaretleri katla (ş→s) → kaba kök: ilk `kok` harf ("iadeyi" → "iade")."""
    metin = metin.replace("İ", "i").replace("I", "ı").lower().translate(KATLA)
    return [s[:kok] for s in re.findall(r"[a-z0-9]+", metin) if len(s) > 1]


class BM25:
    def __init__(self, belgeler: list[str], k1: float = 1.4, b: float = 0.75) -> None:
        self.tf = [Counter(belirtecle(m)) for m in belgeler]
        self.boy = [sum(c.values()) for c in self.tf]
        self.ort, self.n, self.k1, self.b = sum(self.boy) / len(self.boy), len(belgeler), k1, b
        self.df = Counter(t for c in self.tf for t in c)

    def ara(self, sorgu: str, k: int = 3) -> list[tuple[int, float]]:
        sonuc = []
        for i, tf in enumerate(self.tf):
            puan = 0.0
            for t in belirtecle(sorgu):
                if f := tf.get(t, 0):
                    idf = math.log(1 + (self.n - self.df[t] + 0.5) / (self.df[t] + 0.5))
                    puan += idf * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.boy[i] / self.ort))
            if puan > 0:  # sıfır puan = ortak sözcük yok: "ilgili" sayılmaz
                sonuc.append((i, round(puan, 2)))
        return sorted(sonuc, key=lambda x: -x[1])[:k]


belgeler = [
    "İade süresi teslimden itibaren 14 gündür. Kullanılmamış ürün iade edilebilir.",
    "Kargo ücreti 500 TL altı siparişlerde 49,90 TL'dir; 500 TL ve üzeri siparişlerde ücretsizdir.",
    "Faturanız e-posta adresinize gönderilir. Kurumsal fatura için vergi numarası gerekir.",
    "Şifrenizi unuttuysanız giriş ekranındaki bağlantıyla yenileyebilirsiniz.",
]
dizin = BM25(belgeler)
print(dizin.ara("iadeyi kaç günde yapabilirim"))
print(dizin.ara("sifremi unuttum"))  # Türkçe harfsiz yazılmış soru: katlama sayesinde bulunur
assert dizin.ara("iadeyi kaç günde yapabilirim")[0][0] == 0 and dizin.ara("sifremi unuttum")[0][0] == 3

# Sözcük uyumsuzluğu: belgede "şifre/yenile", soruda "parola/sıfırla" -> BM25 hiçbir şey bulmaz
assert dizin.ara("parola sıfırlama") == []
ES_ANLAM = {"parola": "şifre", "sıfırlama": "yenileme"}  # alanınıza özgü küçük eş anlam listesi
genis = " ".join(ES_ANLAM.get(s, s) for s in "parola sıfırlama".split())
print(genis, dizin.ara(genis))
assert dizin.ara(genis)[0][0] == 3


def rrf(siralamalar: list[list[int]], k: int = 60) -> list[int]:
    """Karşılıklı sıra birleştirme: puan ölçekleri farklı aramaları sıraya göre birleştirir."""
    puan: Counter[int] = Counter()
    for sira in siralamalar:
        for r, i in enumerate(sira, 1):
            puan[i] += 1 / (k + r)
    return [i for i, _ in puan.most_common()]


assert rrf([[2, 0, 1], [0, 3, 2]])[:2] == [0, 2]  # iki listede de üstte olan öne geçer
```

```cikti
[(0, 2.95)]
[(3, 2.96)]
şifre yenileme [(3, 2.96)]
```

Kaba kök (ilk 4 harf) basit ama yanılır: kısa köklerde fazla eşleşir, uzun eklerde kaçırır. Havuzdaki BM25 ek kırpma
kurallarıyla çalışır (`yz/yz/rag/bm25.py`); yerel gömme ve karma arama `yz/yz/rag/gomme.py`, sıra birleştirme
`yz/yz/rag/dizin.py` (`rrf_birlestir`). Havuzdaki bağımlılıksız karma gömme **anlamı değil yazımı** yakalar
(eş anlamı bulmaz); anlamsal arama için gömme modeli gerekir (`yz` README "Sınırlar"). Eş anlam listesi küçük
alanlarda ucuz ve etkili bir ara çözümdür.

## Bağlam sırası, bütçesi ve "belgede yok"

- **Bütçe:** önce çıktıya yer ayırın, sonra sistem istemi, kalan bütçeye en ilgili parçalar. Sığmayan parçayı
  yarıda kesmeyin, atlayın (havuz: `yz/yz/istem/butce.py`, `parcalari_sigdir`; varsayılan bağlam bütçesi 1800 belirteç).
- **Sıra:** en ilgili parça başta. Uzun bağlamda ortadaki parçalar daha az kullanılır; az ve iyi parça, çok ve
  karışık parçadan iyidir ([bellek ve bağlam](bellek-ve-baglam-yonetimi.md)).
- **Tekrar:** örtüşen ya da aynı belgeden gelen kopya parçaları birleştirin.
- **Eşik:** ilgili parça yoksa model **çağrılmaz**. Havuzda "ilgili" = BM25 puanı > 0 ya da kosinüs benzerliği
  eşiğin üstünde (`RagHatti(asgari_benzerlik=...)`). Gerçek denemede "Şirketin genel müdürü kimdir?" sorusu modele
  hiç gitmeden "Belgelerde bu bilgi yok." yanıtını aldı.

```python calistir
BELGEDE_YOK = "Belgelerde bu bilgi yok."


def baglam_kur(sonuclar: list[tuple[float, str, str]], butce_kelime: int) -> tuple[str, list[str]]:
    """sonuclar: (puan, kaynak, metin), en ilgiliden başlayarak. Bütçeye sığanı numaralar."""
    secilen, kullanilan = [], 0
    for _, kaynak, metin in sonuclar:
        boy = len(metin.split())  # gerçekte belirteç sayın (Türkçe: ~2,6 karakter/belirteç)
        if kullanilan + boy <= butce_kelime:
            secilen.append((kaynak, metin))
            kullanilan += boy
    baglam = "\n\n".join(f"[{i}] {k}\n{m}" for i, (k, m) in enumerate(secilen, 1))
    return baglam, [k for k, _ in secilen]


def sor(soru: str, sonuclar: list[tuple[float, str, str]], model, esik: float = 0.5) -> str:
    ilgili = [s for s in sonuclar if s[0] >= esik]
    if not ilgili:
        return BELGEDE_YOK  # model HİÇ çağrılmaz: uydurma riski ve maliyet sıfır
    baglam, _ = baglam_kur(ilgili, butce_kelime=60)
    istem = (f"Yalnızca aşağıdaki kaynaklara dayanarak yanıtla. Her cümlenin sonuna kaynak numarası yaz: [1].\n"
             f"Koşulları ve istisnaları da yaz. Kaynaklarda yoksa yalnızca şunu yaz: {BELGEDE_YOK}\n\n"
             f"KAYNAKLAR:\n{baglam}\n\nSORU: {soru}")
    return model(istem)


cagrilar = []


def sahte_model(istem: str) -> str:
    cagrilar.append(istem)
    return "500 TL altı siparişlerde kargo 49,90 TL'dir [1]."


sonuclar = [(2.9, "kargo.md › Ücret", "Kargo ücreti 500 TL altı siparişlerde 49,90 TL'dir; üzeri ücretsizdir."),
            (0.7, "iade.md › Süre", "İade süresi teslimden itibaren 14 gündür."),
            (0.2, "hesap.md › Şifre", "Şifrenizi giriş ekranından yenileyebilirsiniz.")]
print(sor("Kargo ücreti ne kadar?", sonuclar, sahte_model))
assert "[1] kargo.md › Ücret" in cagrilar[0] and "hesap.md" not in cagrilar[0]  # eşik altı parça girmedi
print(sor("Genel müdür kim?", [(0.1, "hesap.md › Şifre", "...")], sahte_model))
assert len(cagrilar) == 1  # ikinci soruda model çağrılmadı
```

```cikti
500 TL altı siparişlerde kargo 49,90 TL'dir [1].
Belgelerde bu bilgi yok.
```

İstemdeki "Koşulları ve istisnaları da yaz" satırı gerçek bir hatadan gelir: denemede 0,5B model kargo ücretini
"49,90 TL" diye verdi, "500 TL altı siparişlerde" koşulunu atladı. Dayanaksız ifade denetimi bu **eksikliği**
yakalayamaz (yanlış bir şey yazılmadı); bunu ancak değerlendirme kümesindeki beklenen yanıt yakalar.

## Kaynak gösterme

1. Kaynakları numaralı verin: `[1] kargo.md › Ücret`. Modelden her cümlenin sonunda `[n]` isteyin.
2. Yanıttaki numaraları kaynak listesine **kodla** çevirin; var olmayan numarayı (ör. `[7]`) uyarı yapın.
3. Model atıf yazmadıysa: yanıt cümlesi kaynakta birebir geçiyorsa kaynağı kod bulsun (havuz: `birebir_kaynaklar`).
4. Yanıttaki rakam ve özel adları kaynakta arayın; bulunamayan "dayanaksız" uyarısı olsun
   (`dayanaksizlari_bul`; ölçüm ayrıntısı [RAG değerlendirme](rag-degerlendirme.md)).
5. Küçük model istem biçimini yanıta kopyalar (gerçek denemede kaynak başlığı ve "Soru:" satırı); yankıyı temizleyin
   (`yankiyi_temizle`). Hepsi `yz/yz/rag/yanit.py` içinde.

## Sık başarısızlık kipleri

| Belirti                                              | Nerede     | Neden                                             | Çözüm                                                     |
| ---------------------------------------------------- | ---------- | ------------------------------------------------- | --------------------------------------------------------- |
| "Belgede yok" diyor ama bilgi var                    | Getirme    | Sözcük uyumsuzluğu, eşik yüksek, kök bulunamadı   | Getirmeyi ölçün; eş anlam listesi, gömme, karma arama, eşik |
| Yanlış belgeden yanıt                                | Getirme    | Benzer konulu parçalar; başlık bilgisi yok        | Başlık yolu parçada; yeniden sıralama; k'yı küçültün      |
| Yanıt yarım (koşul/istisna eksik)                    | Parçalama/üretim | Koşul başka parçada ya da model atladı      | Örtüşme, büyük parça; istemde "koşulları da yaz"          |
| Belgede olmayan rakam/ad yanıtta                     | Üretim     | Model kendi bilgisini kattı                       | Dayanaksız denetimi; "yalnızca kaynaklara dayan"; sıcaklık 0 |
| Alakasız soruya alakasız kaynakla uzun yanıt         | Getirme    | İlgililik eşiği yok                               | Eşik + model çağırmadan "belgede yok"                     |
| Tablo sorusuna saçma yanıt                           | Yükleme/parçalama | Tablo satırları dağıldı                     | Tabloyu satır başına "başlık: değer" metnine çevirin      |
| Her yanıtta aynı alt bilgi/telif satırı kaynak oluyor | Temizleme | Yinelenen üst/alt bilgi dizinlendi                | Temizlemede yinelenen satırları atın                      |
| Güncellenen belge eski yanıtı veriyor                | Dizin      | Dizin yenilenmedi; önbellek                       | Belge özetiyle (hash) değişiklik izleme; yeniden dizinleme |
| Belgedeki "talimatlar" uygulanıyor                   | Güvenlik   | Dolaylı istem enjeksiyonu                         | [LLM güvenliği](llm-guvenligi.md): işaretle, ayraç, araç yetkisi |

## Tuzaklar

| Belirti                                                    | Neden                                                  | Çözüm                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Model değiştirildi, sonuç değişmedi                        | Sorun getirmedeydi                                     | Önce getirmeyi ölçün (recall@k); sonra modeli               |
| k büyütülünce yanıt kötüleşti                              | Alakasız parçalar dikkati dağıttı; bütçe taştı          | k'yı ölçerek seçin; eşik ve yeniden sıralama                 |
| Parça boyu "en iyi" değere ayarlandı ama başka belgede bozuk | Boy belgeye bağlı                                     | Kendi belgelerinizde 2–3 boyu ölçün                          |
| Türkçe soruda sözcük araması hiç bulmuyor                   | Kök kırpma ve işaret katlama yok                       | Türkçe belirteçleme; karma arama                             |
| Bağlam bütçesi hep taşıyor                                  | Belirteç İngilizce oranla tahmin edildi                | Türkçe oran (~2,6 karakter/belirteç) ya da gerçek sayım      |
| "Belgede yok" yanıtı tanınmıyor, uyarılar yanlış           | Model sabit cümleyi değiştirerek yazdı                  | "Yok" ifadesini esnek tanıyın (havuz: `belgede_yok_mu`)       |

## Denetim listesi

- [ ] RAG gerçekten gerekli: belgeler bağlama sığmıyor ya da sık değişiyor; sayım/toplama soruları araçta.
- [ ] Temizleme yinelenen üst/alt bilgiyi ve bozuk kodlamayı gideriyor.
- [ ] Parçalar başlık yolu ve kaynak bilgisi taşıyor; tablo/liste ortadan bölünmüyor; örtüşme var.
- [ ] Türkçe belirteçleme (katlama + kök) ve tercihen karma arama kullanılıyor.
- [ ] İlgililik eşiği var; ilgili parça yoksa model çağrılmadan "belgede yok" dönüyor.
- [ ] Bağlam bütçesi çıktıya yer ayırarak hesaplanıyor; parçalar numaralı ve ayraçlı.
- [ ] Atıflar kodla kaynağa çevriliyor; dayanaksız rakam/ad ve yankı denetleniyor.
- [ ] Getirme ve yanıt ayrı ayrı ölçüldü ([RAG değerlendirme](rag-degerlendirme.md)).

## Küçük modele yaptırırken

- **İsteme yazın:** "Yalnızca KAYNAKLAR bölümüne dayan. Her cümlenin sonuna [n] yaz. Koşulları ve istisnaları da
  yaz. Kaynaklarda yoksa yalnızca şunu yaz: Belgelerde bu bilgi yok." Kaynakları numaralı ve ayraçlı verin; soru en
  sonda olsun.
- **Modelin tipik hatası:** kaynak başlığını ve "Soru:" satırını yanıta kopyalamak; koşulu atlamak; atıf yazmamak;
  kendi bilgisini eklemek; "yok" cümlesini değiştirerek yazmak.
- **Çıktıda denetleyin:** atıf numaraları geçerli mi; rakam ve özel adlar kaynakta var mı; yanıtın başında/sonunda
  istem yankısı var mı; "yok" yanıtı doğru tanındı mı.
- **Hattı kurdururken:** "Önce getirmeyi recall@k ile ölç, sonra modeli değiştir" deyin; küçük model sorunu
  genellikle modelde arar.

## İlgili

- [RAG değerlendirme](rag-degerlendirme.md) · [Bellek ve bağlam yönetimi](bellek-ve-baglam-yonetimi.md) ·
  [Çok kipli girdi ve belge](cok-modlu-ve-belge.md) · [LLM güvenliği](llm-guvenligi.md)
- Havuz: [`yz/yz/rag/`](../../yz/yz/rag/) — [`parcala.py`](../../yz/yz/rag/parcala.py), [`bm25.py`](../../yz/yz/rag/bm25.py),
  [`gomme.py`](../../yz/yz/rag/gomme.py), [`dizin.py`](../../yz/yz/rag/dizin.py), [`siralama.py`](../../yz/yz/rag/siralama.py),
  [`yanit.py`](../../yz/yz/rag/yanit.py); örnek belgeler ve sorular: [`gorevler/getirme/`](../../yz/gorevler/getirme/)
- Arama ölçümü ve kip seçimi: [yz kararları](../../yz/docs/KARARLAR.md) K-08; gömme modelini alana uydurma:
  [`ince-ayar`](../../ince-ayar/README.md) (`gomme` görevi)
