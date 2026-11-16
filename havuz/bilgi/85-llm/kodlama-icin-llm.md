---
baslik: Kod modeliyle çalışmak
ozet: Kod modeline görev ve bağlam verme, küçük adım ve her adımda denetim komutu; uydurma API, yarım iş, testi gevşetme, gereksiz yeniden yazım gibi kusurları yakalama ve baştan başlama.
etiketler: [llm, kodlama, kod-ajani, inceleme, test]
duzey: orta
guncellik: 2026-11
---

# Kod modeliyle çalışmak

> Bu notu ne zaman okumalı: Bir kod modeline (kod ajanına) özellik ekletirken, hata düzelttirirken ya da yeniden
> düzenletirken; modelin değişikliğini kabul etmeden önce; model aynı hatada dönüp duruyorsa.

## Temel fikir

Kod modeli hızlı ama güvenilmez bir yardımcıdır: depoyu bilmez, emin görünür, var olmayan işlevi uydurur, testi
geçirmek için testi gevşetebilir. Verimli çalışmanın dört parçası vardır: **kesin görev** (amaç, kapsam, kabul
ölçütü), **doğru bağlam** (ilgili dosyalar ve kurallar dosyası, fazlası değil), **küçük adım** ve **her adımdan sonra
denetim komutu** (test, tip denetimi, lint). Kabul etmeden önce değişikliği (diff) okuyun: hangi dosyalar, test
değişti mi, yeni bağımlılık var mı, istenmeyen yeniden yazım var mı. Model aynı hatada üç kez dönüyorsa bağlam
kirlenmiştir: kısa bir özetle yeni oturumda baştan başlayın.

## Karar tablosu

| Durum                                                   | Ne yapılır                                                      | Neden                                              |
| ------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Görev büyük (birden çok dosya/özellik)                  | Dilimlere bölün; her dilim tek oturum/adım                       | Küçük adım denetlenebilir ([işi parçalama](../00-yontem/isi-parcalama.md)) |
| Depoda benzer kod var                                   | "Şu dosyayı örnek al" deyin                                     | Model örneği kopyalarken kurallara uyar            |
| Kütüphane sürümü yeni/bilinmiyor                        | Kurulu paketin kaynağını/tiplerini okutun                        | Ezberdeki API eski olabilir                        |
| Hata düzeltme                                           | Önce hatayı yeniden üreten test, sonra düzeltme                 | Düzeltmenin kanıtı test olur ([hata ayıklama](../00-yontem/hata-ayiklama.md)) |
| Yeniden düzenleme                                       | Önce davranışı sabitleyen test; davranış değişmez               | [Yeniden düzenleme](../00-yontem/yeniden-duzenleme.md) |
| Model testi değiştirmek istiyor                         | Gerekçe isteyin; eski ve yeni beklenti yan yana                 | Testi gevşetmek en sinsi hatadır                   |
| Aynı hata 3 kez, diff kapsam dışına taştı               | Durun; özet + başarısız testle yeni oturum                       | Kirlenmiş bağlam düzelmez                          |

## Görevi tarif etme

```text
Amaç:       Fatura özetinde KDV satırını göster.
Kapsam:     yalnız src/fatura/ozet.py ve tests/test_ozet.py. Başka dosyaya dokunma.
Örnek:      src/fatura/ozet.py içindeki ara_toplam_satiri işlevini örnek al.
Kurallar:   AGENTS.md'yi oku. Yeni bağımlılık ekleme. Para hesabı Decimal ile.
Kabul:      `python scripts/check.py` yeşil; yeni test: 1.000,00 TL'ye %20 KDV → "KDV: 200,00 TL".
Biçim:      Önce planını 3 maddede yaz, onayımı bekle, sonra uygula.
```

Kötü tarif: "KDV'yi de ekle." (Hangi ekrana? Oran nereden? Nasıl doğrulanacak? Hangi dosyalar?)

## Bağlam verme

- **Kurallar dosyası** (AGENTS.md, CLAUDE.md gibi): komutlar, klasör haritası, değişmez kurallar, sık hatalar,
  bitti tanımı. Havuzdaki şablon: [STANDARTLAR §13](../../STANDARTLAR.md); örnek: [`yz/AGENTS.md`](../../yz/AGENTS.md).
- **İlgili dosyalar, fazlası değil:** değişecek dosya, örnek alınacak dosya, ilgili tip/arayüz tanımları. Bütün depoyu
  bağlama doldurmak dikkati dağıtır ([bellek ve bağlam](bellek-ve-baglam-yonetimi.md)).
- **Hata iletisinin tamamı:** yığın izi (stack trace), çalıştırılan komut, beklenen ve görülen.
- **Sürüme bağlı API:** kurulu paketin kaynağını ya da tip tanımını okutun (`site-packages/...`, `node_modules/...`);
  ezberden yazdırmayın.
- **Önce oku, sonra planla, sonra yaz:** modelden değişiklikten önce ilgili dosyaları okuyup kısa plan yazmasını isteyin.

## Küçük adım ve denetim komutu

1. Tek bir değişiklik (bir işlev, bir test, bir dosya).
2. Denetim komutu: havuz temellerinde `python scripts/check.py` ya da `npm run check`; tek test dosyası daha hızlı.
3. Kırmızıysa: hata iletisini modele verin, **yalnız o hatayı** düzeltmesini isteyin.
4. Yeşilse: diff'i okuyun, ara durak alın (değişiklik listesini kaydedin), sonraki adıma geçin.

Kural testleri modelin alışkanlık hatalarını kendiliğinden yakalar: havuzdaki `yz` temeli yerleşik `lower()/upper()`
kullanımını, `eval/exec`'i, başlık yorumu eksik dosyayı ve yarım işi testle yasaklar (`yz/tests/test_kurallar.py`).
Kuralı istemde tekrar etmek yerine teste koyun: test unutmaz.

## Tipik kusurlar ve yakalama yolları

| Kusur                                  | Belirti                                                     | Yakalama                                                       |
| -------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Uydurma API                            | Var olmayan işlev/parametre; eski sürümün adı               | Tip denetimi, çalıştırma; aşağıdaki API denetimi               |
| Yarım iş                               | `TODO`, `pass`, `NotImplementedError`, "basitleştirilmiş" gövde | Diff taraması; kural testi (yarım iş yasak)                  |
| Testi gevşetme                         | `assert x == 5` → `assert x is not None`; `skip`, `xfail`, `.only` | Test dosyası diff'ini ayrı okuyun; aşağıdaki tarayıcı     |
| Denetimi susturma                      | `# type: ignore`, `noqa`, `eslint-disable`                  | Diff taraması; gerekçe isteyin                                 |
| Gereksiz yeniden yazım                 | Küçük iş için dosyanın tamamı değişmiş, biçim/ad değişiklikleri | Silme oranı; "yalnız gereken satırları değiştir"           |
| Kapsam taşması                         | İstenmeyen dosyalar değişmiş                                 | Değişen dosya listesini kapsamla karşılaştırın                 |
| Sessiz davranış değişikliği            | Varsayılan değer, hata iletisi, sıralama değişmiş            | Mevcut testler + diff okuması                                  |
| Yeni bağımlılık                        | `requirements`, `package.json` değişmiş                      | Bağımlılık dosyası değişikliğini ayrıca onaylayın              |
| Güvenlik açığı                         | `eval`, `shell=True`, biçimlendirilmiş SQL, `innerHTML`      | Tarama + [LLM güvenliği](llm-guvenligi.md) listesi             |
| Türkçe harf hatası                     | `upper()/lower()`, `toUpperCase()` yerel kuralsız            | Kural testi ([Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)) |

Diff'i otomatik tarayan basit bir denetçi, okumadan önce dikkatinizi doğru yere çeker:

```python calistir
import re

KURALLAR = [  # (açıklama, yalnız test dosyasında mı, satır türü: + eklenen / - silinen, desen)
    ("testten doğrulama silindi", True, "-", r"\b(assert|expect\(|self\.assert)"),
    ("test atlandı/daraltıldı", True, "+", r"(@pytest\.mark\.(skip|xfail)|\.skip\(|\.only\(|it\.todo)"),
    ("yarım iş", False, "+", r"(TODO|FIXME|NotImplementedError|^\s*pass\s*$)"),
    ("denetim susturuldu", False, "+", r"(type:\s*ignore|noqa|eslint-disable|@ts-ignore)"),
    ("tehlikeli çağrı", False, "+", r"\b(eval|exec)\(|shell=True"),
]


def diff_bayraklari(diff: str, azami_silme_orani: float = 0.5) -> list[str]:
    bayraklar, dosya, eklenen, silinen = [], "", 0, 0
    for satir in diff.splitlines():
        if satir.startswith("+++ "):
            dosya = satir[6:] if satir.startswith("+++ b/") else satir[4:]
            if re.search(r"(requirements.*\.txt|pyproject\.toml|package\.json)$", dosya):
                bayraklar.append(f"{dosya}: bağımlılık dosyası değişti (yeni paket mi?)")
            continue
        if satir.startswith("--- "):
            continue
        tur, govde = satir[:1], satir[1:]
        eklenen += tur == "+"
        silinen += tur == "-"
        test_mi = bool(re.search(r"(^|/)(tests?/|test_)|\.test\.", dosya))
        for aciklama, yalniz_test, beklenen_tur, desen in KURALLAR:
            if tur == beklenen_tur and (test_mi or not yalniz_test) and re.search(desen, govde):
                bayraklar.append(f"{dosya}: {aciklama}: {govde.strip()}")
    if eklenen + silinen and silinen / (eklenen + silinen) > azami_silme_orani:
        bayraklar.append(f"değişikliğin %{100 * silinen // (eklenen + silinen)}'i silme: gereksiz yeniden yazım mı?")
    return bayraklar


diff = """--- a/tests/test_fatura.py
+++ b/tests/test_fatura.py
-    assert toplam("1.020,00") == 1020.0
+    assert toplam("1.020,00") is not None
+@pytest.mark.skip("geçici")
--- a/fatura.py
+++ b/fatura.py
+def kdv_hesapla(tutar):  # TODO: oranı ayardan al
+    return eval(f"{tutar} * 0.20")  # type: ignore
--- a/requirements.txt
+++ b/requirements.txt
+parse-tutar==0.1
"""
for bayrak in diff_bayraklari(diff):
    print("-", bayrak)
assert len(diff_bayraklari(diff)) == 6
```

```cikti
- tests/test_fatura.py: testten doğrulama silindi: assert toplam("1.020,00") == 1020.0
- tests/test_fatura.py: test atlandı/daraltıldı: @pytest.mark.skip("geçici")
- fatura.py: yarım iş: def kdv_hesapla(tutar):  # TODO: oranı ayardan al
- fatura.py: denetim susturuldu: return eval(f"{tutar} * 0.20")  # type: ignore
- fatura.py: tehlikeli çağrı: return eval(f"{tutar} * 0.20")  # type: ignore
- requirements.txt: bağımlılık dosyası değişti (yeni paket mi?)
```

Uydurma API'yi çalıştırmadan önce yakalamanın ucuz yolu: kodun kullandığı `modul.ad` biçimindeki her adı kurulu
modülde aramak.

```python calistir
import ast
import importlib


def uydurma_api(kod: str) -> list[str]:
    """`modul.ad` biçimindeki her kullanımı kurulu modülde arar; bulunamayanlar uydurma olabilir."""
    agac = ast.parse(kod)
    takma = {}  # import json as j -> {"j": "json"}
    for dugum in ast.walk(agac):
        if isinstance(dugum, ast.Import):
            takma.update({a.asname or a.name: a.name for a in dugum.names})
    eksik = []
    for dugum in ast.walk(agac):
        if isinstance(dugum, ast.Attribute) and isinstance(dugum.value, ast.Name) and dugum.value.id in takma:
            modul = importlib.import_module(takma[dugum.value.id])
            if not hasattr(modul, dugum.attr):
                eksik.append(f"{takma[dugum.value.id]}.{dugum.attr}")
    return eksik


model_kodu = """
import json
import textwrap as tw
veri = json.loads_safe(metin)           # böyle bir işlev yok
satirlar = tw.wrap(metin, 40)            # var
yazi = json.dumps(veri, ensure_ascii=False)  # var
ozet = tw.summarize(metin)               # yok
"""
print(uydurma_api(model_kodu))
assert uydurma_api(model_kodu) == ["json.loads_safe", "textwrap.summarize"]
```

```cikti
['json.loads_safe', 'textwrap.summarize']
```

Bu yalnız modül düzeyini denetler; nesne yöntemleri ve parametre adları için tip denetimi (mypy, TypeScript `tsc`)
ve testler gerekir. Tip denetimi açık ve sıkı tutulursa uydurma API'lerin çoğu çalıştırmadan yakalanır.

## Ne zaman baştan başlanır

| Belirti                                                    | Ne yapılır                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Aynı hata 3 kez, her seferinde başka bir "düzeltme"         | Durun; hatayı yeniden üreten en küçük test + kısa özetle yeni oturum    |
| Diff kapsamın çok dışına taştı                              | Değişikliği geri alın; görevi daralttırıp yeniden başlayın              |
| Model kendi önceki kararlarıyla çelişiyor                   | Bağlam kirlendi/doldu: yeni oturum, yalnız gerekli dosyalar             |
| Model sürekli testi değiştirmeyi öneriyor                   | Testin doğru olduğundan eminseniz bunu kural olarak yazın; yeni oturum  |
| Çözüm büyüdükçe karmaşıklaşıyor                             | Tasarım sorunu: önce yaklaşımı tartıştırın, kod yazdırmayın             |

Yeni oturuma taşınacak özet: amaç, değişmez kurallar, şimdiye kadar öğrenilen (neyin işe yaramadığı dahil), başarısız
test ve tam hata iletisi. Eski konuşmanın tamamını taşımayın.

## Tuzaklar

| Belirti                                                     | Neden                                                   | Çözüm                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Testler geçiyor ama özellik çalışmıyor                      | Test gevşetildi ya da yanlış şeyi sınıyor               | Test diff'ini okuyun; uçtan uca bir deneme                   |
| "Bitti" dendi, dosyada TODO var                             | Yarım iş                                                | Kural testi; diff taraması                                   |
| Küçük düzeltme 600 satırlık diff oldu                       | Dosya baştan yazıldı, biçim değişti                     | "Yalnız gereken satırları değiştir"; biçimleyiciyi ayrı çalıştırın |
| Kod derleniyor ama çalışmada `AttributeError`               | Uydurma ya da eski sürüm API'si                          | Kurulu paketten doğrulama; tip denetimi                      |
| Model depodaki yardımcıyı bilmeden yenisini yazdı           | Bağlamda yoktu                                           | Kurallar dosyasında "harita"; örnek dosyayı gösterin          |
| Güvenlik açığı (eval, kaçışsız HTML) eklendi                | Kısa yol tercih edildi                                   | Kural testi + tarama                                         |
| Model "çalıştırdım, geçti" dedi ama çıktı yok                | Komutu çalıştırmadan sonucu tahmin etti                  | Komut çıktısının tamamını isteyin; kendiniz çalıştırın       |

## Denetim listesi

- [ ] Görev tarifinde amaç, kapsam (dosyalar), örnek dosya, kurallar ve kabul ölçütü (komut + test) var.
- [ ] Model değişiklikten önce ilgili dosyaları okudu ve plan yazdı.
- [ ] Her adımdan sonra denetim komutu çalıştırıldı ve çıktısı görüldü.
- [ ] Diff okundu: değişen dosyalar kapsamda; test değişiklikleri gerekçeli; bağımlılık değişikliği onaylı.
- [ ] Diff'te TODO, `pass`, skip, susturma, `eval`, `shell=True`, kaçışsız HTML yok (ya da gerekçeli).
- [ ] Sürüme bağlı API kurulu paketten doğrulandı.
- [ ] Yeni davranış için test var; hata düzeltmesinde önce kırmızı olan test vardı.
- [ ] Kurallara yeni bir "sık hata" eklendiyse kurallar dosyasına ve mümkünse kural testine yazıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce AGENTS.md'yi ve şu dosyaları oku. Planını 3 maddede yaz. Yalnız şu dosyaları değiştir.
  Testi gevşetme; test değişmesi gerekiyorsa eski ve yeni beklentiyi gerekçesiyle yaz. Yeni bağımlılık ekleme.
  Her adımdan sonra `python scripts/check.py` çalıştır ve çıktının son 20 satırını göster."
- **Küçük kod modelinin tipik hatası:** kuralları birkaç adım sonra unutmak; dosyanın tamamını yeniden yazmak; hata
  iletisini okumadan başka bir şey değiştirmek; komutu çalıştırmadan "geçti" demek; havuzdaki yardımcı yerine yenisini
  yazmak.
- **Çıktıda denetleyin:** yukarıdaki diff taraması; değişen dosya listesi; denetim komutunun gerçek çıktısı; yeni
  testlerin gerçekten yeni davranışı sınadığı (kodu bozunca kırmızıya dönüyor mu).
- Kuralı istemde yinelemek yerine kural testine çevirin; küçük model istemi unutur, test unutmaz.

## İlgili

- Yöntem notları: [İşi parçalama](../00-yontem/isi-parcalama.md), [Kod inceleme](../00-yontem/kod-inceleme.md),
  [Hata ayıklama](../00-yontem/hata-ayiklama.md), [Yeniden düzenleme](../00-yontem/yeniden-duzenleme.md),
  [Yabancı kod okuma](../00-yontem/yabanci-kod-okuma.md), [Test stratejisi](../00-yontem/test-stratejisi.md);
  diff ve geri alma: [Git](../10-diller/git.md)
- [İstem mühendisliği](istem-muhendisligi.md) · [Bellek ve bağlam yönetimi](bellek-ve-baglam-yonetimi.md) ·
  [LLM güvenliği](llm-guvenligi.md) · [Araç protokolleri ve MCP](arac-protokolleri-ve-mcp.md) (kod ajanına araç bağlama)
- Havuz: [STANDARTLAR](../../STANDARTLAR.md) (AGENTS.md şablonu, kural testleri), örnek kurallar dosyası
  [`yz/AGENTS.md`](../../yz/AGENTS.md), kural testleri [`test_kurallar.py`](../../yz/tests/test_kurallar.py)
