---
baslik: RAG değerlendirme: getirme ve yanıtı ayrı ölçmek
ozet: Küçük bir altın küme kurma, getirmeyi recall@k ve MRR ile, yanıtı sadakat ve eksik olgu denetimiyle ölçme; hatanın getirmede mi üretimde mi olduğunu soru soru teşhis etme.
etiketler: [llm, rag, degerlendirme, recall, mrr, sadakat]
duzey: orta
guncellik: 2026-11
---

# RAG değerlendirme: getirme ve yanıtı ayrı ölçmek

> Bu notu ne zaman okumalı: Belgeye soru soran bir sistem kurduktan sonra, "yeterince iyi mi?" sorusunu yanıtlamak
> için; parça boyu, arama türü, k, model ya da istem değişikliğinden önce ve sonra; kullanıcı "yanlış yanıt verdi"
> dediğinde hatanın yerini bulmak için.

## Temel fikir

RAG iki ayrı işin zinciridir: **getirme** (doğru parça bağlama girdi mi?) ve **üretim** (model o parçayı doğru ve
eksiksiz kullandı mı?). Tek bir "doğruluk" sayısı hangisinin bozuk olduğunu söylemez; ikisini ayrı ölçün. Getirme
için ilgili kaynağı bilinen sorular (altın küme) ve recall@k / MRR; yanıt için beklenen olgular, dayanaksız rakam/ad
denetimi ve "belgede yok" davranışı. Sonra her soruyu sınıflandırın: getirme hatası mı, üretim hatası mı, yanlış ret
mi, uydurma mı? Çalışmayı hata en çok nerede ise oraya yöneltin. Model değiştirmek getirme hatasını düzeltmez.

## Karar tablosu: hangi ölçü hangi soruya

| Soru                                                     | Ölçü                                           | Not                                                  |
| -------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Doğru parça ilk k sonuçta mı?                            | recall@k (ve isabet@k: en az biri var mı)       | k = bağlama gerçekten koyduğunuz parça sayısı        |
| Doğru parça ne kadar üstte?                              | MRR@k                                          | Bütçe dar, k küçükse önemlidir                        |
| Hangi arama kipi/parça boyu daha iyi?                    | Aynı kümede kip/boy başına recall@k ve MRR     | `python -m yz sor --getirme-olc sorular.jsonl --k 3`  |
| Yanıt kaynakta olmayan şey söylüyor mu?                  | Dayanaksız rakam/ad oranı                      | Yanlışı yakalar; **eksikliği yakalamaz**              |
| Yanıt gerekeni söylüyor mu (koşul, istisna dahil)?       | Beklenen olgular: geçiyor mu                   | Altın kümede "mutlaka geçmeli" listesi                |
| Belgede olmayan soruda "yok" diyor mu?                   | Doğru ret oranı + uydurma oranı                | Kümenin %10–20'si yanıtsız soru olsun                 |
| Belgede olan soruda boş yere "yok" diyor mu?             | Yanlış ret oranı                               | Eşik ya da istem fazla katı                           |

## Altın küme kurma

1. **Gerçek sorulardan başlayın:** destek kayıtları, e-postalar, arama günlükleri. Belgeye bakarak soru yazarsanız
   belgedeki sözcükleri kullanırsınız ve sözcük araması olduğundan iyi görünür.
2. **20–50 soru** yeterli başlangıçtır; her değişiklikte hepsi koşulur.
3. Her soru için: ilgili kaynaklar (dosya adı ya da dosya + başlık; parça kimliği yeniden parçalamada değişir),
   kısa beklenen yanıt, **mutlaka geçmesi gereken olgular** (rakam, koşul, istisna).
4. **Zor örnekler ekleyin:** eş anlamlı sözcükle sorulan, Türkçe harfsiz yazılmış ("iade sureci"), iki belge
   gerektiren, koşullu yanıtı olan, yazım hatalı sorular.
5. **Yanıtsız sorular ekleyin** (%10–20): belgede olmayan ama alana yakın sorular ("genel müdür kim?").
6. Kümeyi sürümleyin; belgeler değişince ilgili kaynakları güncelleyin.

JSONL biçimi (havuzdaki `yz/gorevler/getirme/sorular.jsonl` genişletilmiş hâli):

```text
{"soru": "Kargo ücreti ne kadar?", "ilgili": ["kargo.md"], "olgular": ["49,90", "500 TL altı"]}
{"soru": "iade sureci kac gun", "ilgili": ["iade.md"], "olgular": ["14 gün"]}
{"soru": "Şirketin genel müdürü kim?", "ilgili": [], "olgular": []}
```

## Getirmeyi ölçmek: recall@k ve MRR

```python calistir
def recall_at_k(sonuc: list[str], ilgili: set[str], k: int) -> float:
    return len(set(sonuc[:k]) & ilgili) / len(ilgili)


def ters_sira(sonuc: list[str], ilgili: set[str], k: int) -> float:
    """İlk ilgili sonucun sırasının tersi (1/sıra); ilk k içinde yoksa 0. Ortalaması MRR'dir."""
    return next((1 / sira for sira, kaynak in enumerate(sonuc[:k], 1) if kaynak in ilgili), 0.0)


kume = [  # altın küme + aramanın döndürdüğü sıralı kaynaklar
    {"soru": "İade süresi kaç gün?", "ilgili": {"iade.md"}, "sonuc": ["iade.md", "kargo.md", "fatura.md"]},
    {"soru": "Kargo ücreti ne kadar?", "ilgili": {"kargo.md"}, "sonuc": ["iade.md", "kargo.md", "hesap.md"]},
    {"soru": "İade edilen ürünün faturası ne olur?", "ilgili": {"fatura.md", "iade.md"},
     "sonuc": ["hesap.md", "fatura.md", "kargo.md"]},
    {"soru": "Parolamı nasıl sıfırlarım?", "ilgili": {"hesap.md"}, "sonuc": ["fatura.md", "kargo.md", "iade.md"]},
]
for k in (1, 3):
    recall = sum(recall_at_k(s["sonuc"], s["ilgili"], k) for s in kume) / len(kume)
    mrr = sum(ters_sira(s["sonuc"], s["ilgili"], k) for s in kume) / len(kume)
    print(f"k={k}: recall@k {recall:.3f}  MRR@k {mrr:.3f}")
kacan = [s["soru"] for s in kume if ters_sira(s["sonuc"], s["ilgili"], 3) == 0]
print("ilk 3'te hiç ilgili yok:", kacan)
assert recall_at_k(kume[2]["sonuc"], kume[2]["ilgili"], 3) == 0.5  # iki ilgiliden biri geldi
```

```cikti
k=1: recall@k 0.250  MRR@k 0.250
k=3: recall@k 0.625  MRR@k 0.500
ilk 3'te hiç ilgili yok: ['Parolamı nasıl sıfırlarım?']
```

Okuma kuralları:

- **Ortalamaya değil kaçan sorulara bakın.** "Parolamı nasıl sıfırlarım?" belgede "şifre … yenile" diye geçiyorsa
  sorun sözcük uyumsuzluğudur; çözüm eş anlam listesi ya da anlamsal gömmedir ([RAG tasarımı](rag-tasarimi.md)).
- recall@k yüksek ama MRR düşükse doğru parça geliyor ama aşağıda; bütçe dar ise yeniden sıralama düşünün.
- Kipleri aynı kümede karşılaştırın. Havuzdaki örnek ölçüm (10 soru, k=3): recall@3 bm25, vektör ve karma kipte
  1,0; MRR bm25 0,93, vektör 1,0, karma 0,95 ([yz kararı K-08](../../yz/docs/KARARLAR.md)). Küme küçük ve kolaydır,
  kendi belgelerinizde sonuç farklı çıkar.
- Gerçekleme: `yz/yz/rag/degerlendir.py` (`getirme_olc`).

## Yanıtı ölçmek: sadakat ve eksik olgu

İki ayrı denetim yapın. **Dayanaksız denetimi** yanıttaki rakam ve özel adları bağlamda arar: yanlış bir şey
eklendiyse yakalar. **Olgu denetimi** altın kümedeki "mutlaka geçmeli" olguları yanıtta arar: eksik bıraktıysa
yakalar. Gerçek denemedeki hata ikinci türdendi: 0,5B model kargo ücretini "49,90 TL" verdi, "500 TL altı" koşulunu
atladı ([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md) §2).

```python calistir
import re


def normalle(metin: str) -> str:
    return metin.replace("İ", "i").replace("I", "ı").lower()


def sayilar(metin: str) -> set[str]:
    """'1.020,00' → '1020.00', '49,90' → '49.90' (Türkçe binlik noktayı at, ondalık virgülü noktaya çevir)."""
    return {re.sub(r"\.(?=\d{3}\b)", "", s).replace(",", ".") for s in re.findall(r"\d+(?:[.,]\d+)*", metin)}


def dayanaksiz(yanit: str, baglam: str) -> list[str]:
    """Yanıtta olup bağlamda olmayan rakam ve büyük harfli adlar: uydurma belirtisi."""
    yanit = re.sub(r"\[\d+\]", "", yanit)  # önce atıf numaralarını at: "[1]" rakam sayılmasın
    eksik = sorted(sayilar(yanit) - sayilar(baglam))
    return eksik + [a for a in re.findall(r"\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}", yanit) if normalle(a) not in normalle(baglam)]


def eksik_olgular(yanit: str, olgular: list[str]) -> list[str]:
    """Altın kümede 'yanıtta mutlaka geçmeli' denen olgulardan eksik olanlar: atlama belirtisi."""
    return [o for o in olgular if normalle(o) not in normalle(yanit)]


baglam = "Kargo ücreti 500 TL altı siparişlerde 49,90 TL'dir; 500 TL ve üzeri siparişlerde ücretsizdir."
olgular = ["49,90", "500 TL altı"]
yanitlar = {
    "gerçek denemedeki": "Kargo ücreti 49,90 TL'dir [1].",
    "uydurmalı": "Kargo ücreti 39,90 TL'dir, Aras Kargo ile gönderilir [1].",
    "doğru": "500 TL altı siparişlerde kargo 49,90 TL'dir; üzeri ücretsizdir [1].",
}
for ad, yanit in yanitlar.items():
    print(f"{ad}: dayanaksız={dayanaksiz(yanit, baglam)} eksik={eksik_olgular(yanit, olgular)}")
assert dayanaksiz(yanitlar["gerçek denemedeki"], baglam) == []  # dayanaksız denetimi atlamayı GÖRMEZ
assert eksik_olgular(yanitlar["gerçek denemedeki"], olgular) == ["500 TL altı"]  # olgu denetimi görür
```

```cikti
gerçek denemedeki: dayanaksız=[] eksik=['500 TL altı']
uydurmalı: dayanaksız=['39.90', 'Aras'] eksik=['49,90', '500 TL altı']
doğru: dayanaksız=[] eksik=[]
```

Sınırlar: olgu denetimi sözcük eşleşmesidir; "500 liradan az" gibi başka sözcükle doğru yazılmış olguyu kaçırır.
Olguları kısa ve kanonik yazın (rakam + birim), kaçanları elle okuyun. Model-hakem ("yanıt bağlama sadık mı?")
eklenebilir ama hakemi de ölçün: gerçek denemede 0,5B model 12 özet denetim sorusunun hepsine "Hayır" dedi
([değerlendirme](degerlendirme.md)). Havuzdaki çalışan denetim: `yz/yz/rag/yanit.py` (`dayanaksizlari_bul`).

## Hata teşhisi: sorun getirmede mi üretimde mi?

Her soruyu dört bilgiyle sınıflandırın: soru belgede yanıtlanabilir mi, ilgili parça ilk k'da mı, model "yok" dedi
mi, yanıt doğru mu.

```python calistir
from collections import Counter


def teshis(cevaplanabilir: bool, getirildi: bool, yok_dedi: bool, dogru: bool) -> str:
    """Soru başına hatanın yeri: getirme mi, üretim mi?"""
    if not cevaplanabilir:
        return "doğru ret" if yok_dedi else "uydurma: yanıtı olmayan soruya yanıt"
    if not getirildi:
        return "getirme hatası"
    if yok_dedi:
        return "yanlış ret: parça geldi, model kullanmadı"
    return "doğru" if dogru else "üretim hatası"


# (cevaplanabilir, ilgili parça ilk k'da mı, model 'yok' dedi mi, yanıt doğru mu)
kosu = [(True, True, False, True), (True, True, False, False), (True, False, True, False),
        (True, False, True, False), (True, True, True, False), (False, False, True, False),
        (False, False, False, False), (True, True, False, True)]
sayim = Counter(teshis(*s) for s in kosu)
for neden, adet in sayim.most_common():
    print(f"{adet}  {neden}")
assert sayim["getirme hatası"] == 2 and sayim["üretim hatası"] == 1
```

```cikti
2  doğru
2  getirme hatası
1  üretim hatası
1  yanlış ret: parça geldi, model kullanmadı
1  doğru ret
1  uydurma: yanıtı olmayan soruya yanıt
```

| En sık sınıf                    | Nereye çalışılır                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Getirme hatası                  | Parçalama (boy, örtüşme, başlık yolu), Türkçe belirteçleme, eş anlam, gömme, karma arama, k |
| Üretim hatası                   | İstem ("koşulları da yaz", atıf), bağlam sırası/bütçesi, sıcaklık 0, daha güçlü model |
| Yanlış ret                      | İlgililik eşiği, "yok" kuralının dili ("emin değilsen" yerine "kaynaklarda yoksa") |
| Uydurma (yanıtsız soruya yanıt) | Eşiği yükseltin; model çağırmadan "yok"; dayanaksız denetimini engelleyici yapın  |

## Değişiklik döngüsü

1. Taban ölçüm: getirme (recall@k, MRR) + yanıt (doğru, eksik olgu, dayanaksız, ret oranları) + teşhis dağılımı.
2. Tek değişiklik (parça boyu ya da kip ya da istem ya da model).
3. Aynı kümeyi yeniden koşun; önceki ölçümle yan yana koyun. Önceden doğru olup bozulan sorulara tek tek bakın.
4. Kalıcı olanı kaydedin: hangi değişiklik, hangi sayı, hangi tarih ([değerlendirme](degerlendirme.md) gerileme).

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Sözcük araması kümede kusursuz, kullanıcıda kötü              | Sorular belgeye bakılarak yazıldı (aynı sözcükler)      | Gerçek sorular; eş anlamlı ve harfsiz yazılmış örnekler     |
| Yeniden parçalamadan sonra recall birden düştü                | Altın küme parça kimliğine bağlıydı                     | İlgiliyi dosya (+ başlık) düzeyinde yazın                   |
| Dayanaksız denetimi temiz, kullanıcı "eksik" diyor            | Atlama, yanlışlık değil                                 | Beklenen olgular listesi ve olgu denetimi                    |
| Her yanıtta "dayanaksız 1, 2" uyarısı                         | Atıf numaraları rakam sayıldı                           | Rakam denetiminden önce `[n]` atıflarını atın               |
| %5'lik iyileşme kutlandı                                      | 20 soruda bir sorunun farkı gürültüdür                  | Güven aralığına bakın; değişen soruları tek tek okuyun      |
| Model değişti, doğruluk aynı                                   | Hatalar getirmedeydi                                    | Teşhis dağılımına bakmadan model değiştirmeyin             |
| "Yok" yanıtları yanlış sayıldı                                | Model sabit cümleyi biraz değiştirdi                     | "Yok" ifadesini esnek tanıyın (havuz: `belgede_yok_mu`)      |
| Ölçüm yalnız model-hakemle yapıldı                            | Hakemin kendi hatası ölçülmedi                          | Önce kural/olgu denetimi; hakemi 20 örnekte elle doğrulayın |

## Denetim listesi

- [ ] Altın küme gerçek sorulardan; 20–50 soru; %10–20'si yanıtsız; zor örnekler var.
- [ ] Her soruda ilgili kaynaklar dosya (+ başlık) düzeyinde ve "mutlaka geçmeli" olgular yazılı.
- [ ] Getirme ayrı ölçüldü: recall@k ve MRR, bağlama giren gerçek k ile.
- [ ] Yanıt ayrı ölçüldü: doğru, eksik olgu, dayanaksız rakam/ad, doğru ret, yanlış ret, uydurma.
- [ ] Atıf numaraları rakam denetiminden önce atılıyor.
- [ ] Teşhis dağılımı çıkarıldı; iş en sık hata sınıfına yöneltildi.
- [ ] Her değişiklik öncesi/sonrası aynı kümeyle karşılaştırıldı; bozulan sorular tek tek okundu.

## Küçük modele yaptırırken

- **İsteme yazın:** "Getirme ve yanıtı ayrı ölç. Getirme için recall@k ve MRR; yanıt için beklenen olgular ve
  dayanaksız rakam/ad. Sonra her soruyu teşhis et (getirme hatası, üretim hatası, yanlış ret, uydurma) ve sayılarını
  tablo yap."
- **Modelin tipik hatası:** tek bir "doğruluk" yüzdesi verip durmak; altın kümeyi belgeden kopyalayarak kolay soru
  yazmak; atıf numaralarını rakam saymak; küçük farkı "iyileşme" diye raporlamak.
- **Çıktıda denetleyin:** kümede yanıtsız soru var mı; k bağlama giren sayıyla aynı mı; kaçan sorular listelenmiş mi;
  önceki koşuyla karşılaştırma var mı.
- Ona altın küme yazdırıyorsanız: "Belgedeki sözcükleri kullanma; bir müşterinin yazacağı gibi yaz; Türkçe harfsiz ve
  eş anlamlı örnekler ekle" deyin, sonra soruları kendiniz okuyun.

## İlgili

- [RAG tasarımı](rag-tasarimi.md) · [Değerlendirme](degerlendirme.md) · [LLM güvenliği](llm-guvenligi.md)
- Havuz: [`degerlendir.py`](../../yz/yz/rag/degerlendir.py) (recall@k, MRR), [`yanit.py`](../../yz/yz/rag/yanit.py)
  (dayanaksız, yankı, "yok" tanıma), örnek küme [`sorular.jsonl`](../../yz/gorevler/getirme/sorular.jsonl)
- Gömme modelini alana uydurduktan sonra önce/sonra ölçümü (recall@k, MRR, nDCG):
  [ince-ayar DEGERLENDIRME](../../ince-ayar/docs/DEGERLENDIRME.md)
