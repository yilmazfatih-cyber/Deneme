---
baslik: Yapılı çıktı: modelden güvenilir JSON almak
ozet: Model JSON'u neden bozar; katmanlı strateji (şema kısıtı, araç çağrısı, istem ve onarım); kod çiti, sondaki virgül ve kesik çıktıyı onaran sağlam ayrıştırıcı; doğrula-onar döngüsü; şema tasarım kuralları.
etiketler: [llm, json, yapili-cikti, sema, onarim, dogrulama]
duzey: orta
guncellik: 2026-11
---

# Yapılı çıktı: modelden güvenilir JSON almak

> Bu notu ne zaman okumalı: Model çıktısını bir programa (veritabanı, form, başka bir adım) vereceğinizde;
> `json.loads` hata verdiğinde; model şemaya uyuyor ama değerler yanlışsa; yeni bir çıkarım şeması tasarlarken.

## Temel fikir

Model JSON'u bir dilbilgisine uyarak değil, belirteç belirteç "JSON'a benzeyen metin" olarak üretir. Bu yüzden önsöz,
kod çiti, sondaki virgül, yarıda kesilme ve Türkçe sayı/tarih biçimi olağandır. Güvenilir yol **katmanlıdır**:
sunucu destekliyorsa çıktıyı şemayla kısıtlayın; yoksa araç çağrısı; o da yoksa istem + sağlam ayrıştırıcı + kodla
düzeltme + doğrulama + Türkçe onarım iletisi. Son kural en önemlisidir: **biçim geçerliliği doğruluk değildir.**
Gerçek denemede 0,5B model onarım katmanlarıyla 6/6 geçerli JSON verdi; dört faturanın yalnız birinde numara, toplam
ve para birimi birlikte doğruydu ([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md)).

## Neden bozulur

| Bozukluk                                  | Kaynağı                                                  | Kim düzeltir                          |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| "İşte sonuç:" önsözü, sonda açıklama       | Sohbet verisinden gelen alışkanlık                       | Ayrıştırıcı (ilk nesneyi al)          |
| ```json kod çiti                          | Aynı; gerçek denemede 6 çıktının 5'inde                   | Ayrıştırıcı                           |
| Sondaki virgül, tek tırnak, `True/None`   | JavaScript/Python alışkanlığı                             | Ayrıştırıcı                           |
| Yarıda kesilmiş nesne                     | Çıktı sınırı doldu                                       | Ayrıştırıcı keser + yeniden isteme    |
| `<think>…</think>` bloğu                  | Düşünen modeller                                         | Ayrıştırıcıdan önce ayıklama          |
| "15.03.2024", "1.250,50", "TL"            | Türkçe metinden olduğu gibi kopyalama                    | Kod (doğrulamadan önce düzeltme)      |
| Alan adı çevrilmiş ("Toplam Tutar")        | Model şemayı değil metni izledi                          | Kod (anahtar eşleme)                  |
| Eksik zorunlu alan, uydurma değer          | Model bilmiyor ya da yanlış anladı                       | Doğrulama + onarım isteği; `null` izni |

## Katmanlı strateji

| Katman (sırayla)                       | Nasıl                                                           | Ne zaman işe yarar                                    |
| -------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Şema kısıtlı çözümleme              | Sunucu yalnız şemaya uyan belirteçlere izin verir (json_schema yanıt biçimi, llama.cpp GBNF dilbilgisi, Ollama `format`) | Destekleyen sunucuda bozuk JSON olanaksızlaşır; **değer doğruluğunu sağlamaz** |
| 2. Araç çağrısı                        | Şema bir aracın parametresi olur; model aracı "çağırır"          | Araç destekli sunucu ve az alanlı şema                |
| 3. İstem + sağlam ayrıştırıcı + onarım | Alan listesi + örnek iskelet; çıktı onarılır, doğrulanır, hata modele geri verilir | Her yerde çalışır; en çok emek ister |
| 4. Alan alan soru                      | Her alan için ayrı kısa soru                                    | En küçük modelde bile; yavaş (alan başına bir çağrı)  |

Havuzdaki gerçekleme bu sırayı uygular ve desteklenmeyen katmanı atlar: `yz/yz/yapili/cikar.py`
(`cikar(...)`, sonuçta `CikarimSonucu.rapor()` hangi katmanın kaç turda başardığını yazar). Gerçek denemede şema
desteği olmayan sunucuda geri çekilme çalıştı; araç katmanı 4 alanlı iletişim şemasında 2/2 ilk turda başardı,
iç içe listeli fatura şemasında başaramadı (istem katmanı kurtardı). Şema kısıtlı çözümlemenin gerçek etkisi o
denemede **ölçülmedi** (sunucu desteklemiyordu); GBNF üreticisi llama.cpp ile denenmedi (`yz/docs/KARARLAR.md` K-05).

Şema kısıtı varken bile ayrıştırma ve doğrulamayı silmeyin: sunucu sürümü değişir, kısıt sessizce kapanabilir,
kesik çıktı yine olur.

## Sağlam JSON ayrıştırma

Düzenli ifadeyle "yama" yapmayın: dizgi içindeki virgül ve parantezi bozar. Metni harf harf okuyan, dizgi içinde
olup olmadığını bilen bir okuyucu yazın. Aşağıdaki gerçekleme kod çitini, önsöz/sonsözü, sondaki virgülü ve kesik
çıktıyı çözer. Kesik çıktıda **yarım kalan son alanı uydurmaz, atar** ve `kesik` notu düşer: çağıran ya çıktı
sınırını artırıp yeniden ister ya da eksik alanı doğrulamada yakalar.

```python calistir
import json
import re


def json_ayikla(metin: str) -> tuple[object, list[str]]:
    """Model çıktısından ilk JSON nesnesini/dizisini çıkarır; yaptığı onarımları `notlar`da bildirir."""
    notlar: list[str] = []
    metin = re.sub(r"<think>.*?(?:</think>|$)", "", metin, flags=re.S)  # düşünce bloğunu at
    if cit := re.search(r"```[A-Za-z]*\s*(.*?)(?:```|$)", metin, flags=re.S):
        metin = cit.group(1)
        notlar.append("kod_citi")
    baslar = [i for i in (metin.find("{"), metin.find("[")) if i >= 0]
    if not baslar:
        raise ValueError("çıktıda JSON yok")
    cikti: list[str] = []
    yigin: list[str] = []  # beklenen kapanışlar
    kesim: tuple[int, list[str]] | None = None  # son güvenli kesim noktası: (uzunluk, yığın)
    dizgide = kacis = False
    for ch in metin[min(baslar):]:
        if dizgide:
            dizgide = kacis or ch != '"'
            kacis = not kacis and ch == "\\"
        elif ch == '"':
            dizgide = True
        elif ch in "{[":
            yigin.append("}" if ch == "{" else "]")
        elif ch == ",":
            kesim = (len(cikti), list(yigin))
        elif ch in "}]":
            while cikti and cikti[-1].isspace():
                cikti.pop()
            if cikti and cikti[-1] == ",":  # sondaki virgül
                cikti.pop()
                notlar.append("sondaki_virgul")
            cikti.append(yigin.pop() if yigin else ch)
            if not yigin:
                return json.loads("".join(cikti)), notlar  # nesne bitti; arkasındaki metni at
            kesim = (len(cikti), list(yigin))  # kapanan değer tamdır: burası da güvenli kesim
            continue
        cikti.append(ch)
    notlar.append("kesik")  # metin bitti ama yapı kapanmadı: yarım kalan son alanı at
    if kesim:
        cikti, yigin = cikti[: kesim[0]], kesim[1]
    elif dizgide:
        cikti.append('"')
    return json.loads("".join(cikti) + "".join(reversed(yigin))), notlar


# Gerçek denemede 6 çıktının 5'i kod çitindeydi; düz json.loads bunları okuyamaz
cevap = 'İşte sonuç:\n```json\n{"toplam": 70.0, "para_birimi": "TRY"}\n```'
assert json_ayikla(cevap) == ({"toplam": 70.0, "para_birimi": "TRY"}, ["kod_citi"])
assert json_ayikla('{"a": 1, "b": [1, 2,],}')[0] == {"a": 1, "b": [1, 2]}
assert json_ayikla('Tabii! {"not": "a,} b \\" c", "x": 2} Umarım işinize yarar.')[0] == {"not": 'a,} b " c', "x": 2}
# Kesik çıktı: yarım kalan alan uydurulmaz, atılır; not düşülür
assert json_ayikla('{"ad": "Ali", "sehir": "Ank') == ({"ad": "Ali"}, ["kesik"])
assert json_ayikla('{"kalemler": [{"ad": "Kalem", "adet": 2}, {"ad": "Def')[0] == {"kalemler": [{"ad": "Kalem", "adet": 2}]}
assert json_ayikla('{"a": [1, 2]')[0] == {"a": [1, 2]}  # tamamlanmış dizi korunur
try:
    json_ayikla("Bu metinde fatura bilgisi yok.")
except ValueError as hata:
    print("hata:", hata)
print("tamam")
```

```cikti
hata: çıktıda JSON yok
tamam
```

Bu gerçekleme bilerek kısadır. Tek tırnak, tırnaksız anahtar, yorum, `True/None`, kaçışsız iç tırnak ve birden çok
aday arasında seçim için havuzdaki tam okuyucuyu kullanın: `yz/yz/yapili/json_onar.py` (`json_ayikla`, `json_coz`) ve
`yz/yz/yapili/json_hosgorulu.py`. Yeni bir bozukluk gördüğünüzde önce gerçek örneğini teste ekleyin
(`yz/tests/test_json_onar.py`), sonra hoşgörün.

## Doğrula-onar döngüsü

Sıra önemlidir: **ayrıştır → kodla düzelt → doğrula → yalnız kalan hatayı modele sor.** Kod, bilinen sapmaları
(Türkçe tarih, "1.020,00", "TL") modele hiç sormadan düzeltir. Gerçek denemede tam olarak bu düzeltme çıkarımı
4/6'dan 6/6'ya çıkardı; İngilizce doğrulama iletisiyle yapılan onarım turları ise hiçbir örneği kurtarmadı (model
iki turda da aynı tarihi yazdı ve kalem listesini boşalttı). Onarım iletisi Türkçe, kısa ve **örnekli** olsun.

```python calistir
import json
import re

PARA = {"tl": "TRY", "₺": "TRY", "try": "TRY", "$": "USD", "usd": "USD", "€": "EUR", "eur": "EUR"}


def duzelt(veri: dict) -> dict:
    """Bilinen sapmaları doğrulamadan ÖNCE kod düzeltir; model bu yüzden onarım turuna girmez."""
    veri = dict(veri)
    if isinstance(t := veri.get("tarih"), str) and (m := re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", t.strip())):
        veri["tarih"] = f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}"  # 01.02.2025 -> 2025-02-01
    if isinstance(s := veri.get("toplam"), str) and re.fullmatch(r"[\d.]+,\d{1,2}", s.strip()):
        veri["toplam"] = float(s.replace(".", "").replace(",", "."))  # "1.020,00" -> 1020.0
    if isinstance(p := veri.get("para_birimi"), str):
        veri["para_birimi"] = PARA.get(p.strip().lower(), p)
    return veri


def dogrula(veri: dict) -> list[str]:
    """Türkçe, eyleme dönük hata iletileri: model ne yazacağını anlasın."""
    hatalar = []
    if not isinstance(veri.get("toplam"), (int, float)):
        hatalar.append("toplam eksik ya da sayı değil: metindeki 'Toplam' satırının tutarını sayı olarak yaz, ör. 1020.0")
    if veri.get("tarih") is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(veri["tarih"])):
        hatalar.append("tarih YYYY-AA-GG biçiminde olmalı, ör. 2024-03-15; metinde yoksa null")
    if veri.get("para_birimi") not in ("TRY", "USD", "EUR", None):
        hatalar.append("para_birimi TRY, USD, EUR ya da null olmalı")
    return hatalar


def cikar(model, metin: str, azami_onarim: int = 2) -> tuple[dict, int]:
    iletiler = [{"role": "system", "content": "Yalnızca JSON yaz."},
                {"role": "user", "content": f"Alanlar: toplam, tarih, para_birimi.\nMETİN:\n\"\"\"\n{metin}\n\"\"\""}]
    for tur in range(azami_onarim + 1):
        yanit = model(iletiler)
        try:
            veri = duzelt(json.loads(re.sub(r"^```\w*\s*|\s*```$", "", yanit.strip())))  # gerçekte: json_ayikla
            hatalar = dogrula(veri)
        except (json.JSONDecodeError, AttributeError):
            hatalar = ["JSON okunamadı: yalnızca tek bir JSON nesnesi yaz, ilk karakter {"]
        if not hatalar:
            return veri, tur
        iletiler += [{"role": "assistant", "content": yanit},
                     {"role": "user", "content": "Yanıtın kurallara uymadı:\n- " + "\n- ".join(hatalar)
                      + "\nAynı metin için düzeltilmiş JSON nesnesinin TAMAMINI yaz."}]
    raise ValueError(f"{azami_onarim} onarımda düzelmedi: {hatalar}")


betik = ['```json\n{"tarih": "01.02.2025", "para_birimi": "TL"}\n```',  # toplam eksik; tarih/para kodda düzelir
         '{"toplam": "1.020,00", "tarih": "01.02.2025", "para_birimi": "TL"}']
gelen = []


def sahte_model(iletiler: list[dict]) -> str:
    gelen.append(iletiler[-1]["content"])
    return betik.pop(0)


veri, tur = cikar(sahte_model, "Belge No: 000457 | Tarih: 01.02.2025 | Toplam: 1.020,00 TL")
print(veri, "onarım turu:", tur)
print(gelen[1].splitlines()[1])
assert veri == {"toplam": 1020.0, "tarih": "2025-02-01", "para_birimi": "TRY"} and tur == 1
```

```cikti
{'toplam': 1020.0, 'tarih': '2025-02-01', 'para_birimi': 'TRY'} onarım turu: 1
- toplam eksik ya da sayı değil: metindeki 'Toplam' satırının tutarını sayı olarak yaz, ör. 1020.0
```

Döngü kuralları:

- Onarım turu sınırı 1–2. Aynı hata ikinci turda da sürüyorsa üçüncü tur nadiren düzeltir; sonraki katmana (alan alan
  soru) geçin ya da kaydı insana bırakın.
- Onarım "TAMAMINI yaz" diyorsa model geçerli alanları bozabilir; daha güvenlisi yalnız hatalı alanı ayrı soruyla
  isteyip geçerli alanlarla kodda birleştirmektir.
- Her turun notlarını (`kod_citi`, `tarih_bicimi`, `kesik`) kaydedin: hangi onarımın ne sıklıkta gerektiği, istemi
  ya da modeli değiştirme kararını verir.
- Havuzdaki karşılıklar: Türkçe sayı/tarih düzeltmesi ve Türkçe hata özeti `yz/yz/yapili/sema_araclari.py`
  (`sema_ile_duzelt`, `tarih_iso`, `turkce_sayi`, `hatalari_ozetle`).

## Şema tasarım kuralları

| Kural                                                     | Neden                                                     |
| --------------------------------------------------------- | --------------------------------------------------------- |
| En çok ~8 alan; iç içe en çok bir seviye                  | Küçük model az alanlı, düz şemada daha doğru              |
| Alan adları kısa ama anlamlı, ASCII: `toplam`, `fatura_no` | `t_amt` gibi adları model tahmin eder; Türkçe harf anahtar eşlemeyi zorlaştırır |
| Her alana bir cümlelik açıklama (modele gösterilir)        | Model alanı adından değil açıklamadan anlar               |
| Sabit seçenek için enum (TRY, USD, EUR)                    | Serbest metin her yazımı (TL, lira, ₺) üretir             |
| Olmayabilecek alan boş geçilebilir (`null`)                | Zorunlu alan uydurmaya iter                               |
| Sayı sayı tipinde; birim/para birimi ayrı alanda           | "1.250 TL" dizgisi hesaplanamaz                           |
| Tarih ISO (`YYYY-AA-GG`); dönüşümü kod yapsın               | Model Türkçe biçimi kopyalar                              |
| Serbest metin alanını en aza indirin, uzunluğunu sınırlayın | Uzun serbest alan kesilmeye ve döngüye yol açar          |
| Sürekli yanlış çıkan alanı ayrı adımda sorun                | Tek soruda daha doğru ([zincirler](gorev-bolme-ve-zincirler.md)) |

"Bilinmiyor" değerine izin verin: ya alan `null` olabilir ya da enum'a `"bilinmiyor"` eklenir. İkisinden birini
seçip tutarlı kullanın. İzin yoksa model değer uydurur (gerçek denemede metinde olmayan kalemler); izin varsa tersine
fazla `null` yazabilir (gerçek denemede metinde olan e-posta `null` geldi). İkisini de görev kümesinde ölçün:
"alan doluydu ama model null dedi" ve "alan yoktu ama model doldurdu" ayrı sayılsın.

Kötü ve iyi şema:

```text
Kötü: {"bilgi": "faturadaki her şey", "tutar": "metin", "durum": "metin"}
İyi:  fatura_no (metin, zorunlu) · tarih (YYYY-AA-GG ya da null) · toplam (sayı) ·
      para_birimi (TRY | USD | EUR) · odendi_mi (true | false | null)
```

Şema kısıtlı çözümlemede (GBNF) isteğe bağlı alanlar sorun çıkarır; havuzdaki üretici bütün alanları sırayla
zorunlu yapar, boş kalabilecek alan `null` alır (`yz/yz/yapili/gbnf.py`). Uzunluk, desen ve sayı aralığı gibi
kısıtlar dilbilgisine girmez; onları doğrulama yakalar.

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `json.loads` "Expecting value" hatası                          | Önsöz ya da kod çiti                                      | Sağlam ayrıştırıcı; düz `json.loads` kullanmayın               |
| Dizgi içindeki virgül/parantez "onarımdan" sonra bozuldu       | Düzenli ifadeyle yama                                     | Dizgi durumunu izleyen okuyucu                                 |
| Kesik çıktıda son alanın değeri yarım ("Ank")                  | Kesik dizgi olduğu gibi kapatıldı                         | Yarım alanı atın, `kesik` notu; çıktı sınırını artırıp yeniden isteyin |
| Onarım turları aynı hatayı yineliyor                           | İleti İngilizce/teknik; düzeltilebilir sapma modele bırakılmış | Kod düzeltmesi + Türkçe örnekli ileti; sonraki katman      |
| Onarımdan sonra başka alanlar boşaldı                          | Model nesnenin tamamını yeniden yazarken unuttu           | Yalnız hatalı alanı sorun; geçerli alanları koruyun            |
| Şemaya uyan çıktı yine yanlış                                  | Biçim ≠ doğruluk                                          | Alan bazında doğruluk ölçümü; içerik denetçisi                 |
| Enum alanında hep aynı değer                                   | İskelet örneği değer gibi kopyalandı (olası)               | Seçenekleri birlikte gösterin; dağılımı ölçün                   |
| Şema kısıtı açıkken model sonsuz boşluk/satır üretiyor          | Dilbilgisi boşluğu sınırlamıyor                           | Boşluğu dilbilgisinde sınırlayın; çıktı sınırı                 |
| `<think>` metni JSON'un önünde                                 | Düşünen model                                             | Düşünce bloğunu ayrıştırmadan önce ayıklayın                   |

## Denetim listesi

- [ ] Sunucunun desteklediği en güçlü katman kullanılıyor; desteklenmeyen katman sessizce değil kayıtla atlanıyor.
- [ ] Ayrıştırıcı kod çiti, önsöz, sondaki virgül ve kesik çıktıyı çözüyor; testlerinde gerçek model çıktıları var.
- [ ] Türkçe tarih/sayı/para birimi doğrulamadan önce kodda düzeltiliyor.
- [ ] Doğrulama iletileri Türkçe, kısa, örnekli; onarım turu sınırı 1–2.
- [ ] Şema ≤ 8 alan, düz; her alanın açıklaması var; sabit seçenekler enum; olmayabilecek alanlar `null` olabilir.
- [ ] Kesik çıktı (`kesik` notu ya da bitiş nedeni "length") ayrıca işleniyor.
- [ ] Görev kümesinde biçim geçerliliği ve alan bazında doğruluk **ayrı** raporlanıyor.
- [ ] Onarım notları (hangi düzeltme kaç kez) kaydediliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** alan listesi (ad, tip, bir cümle açıklama), "metinde olmayan alan için null yaz", en sonda
  "Yalnızca JSON yaz" ve tek satırlık biçim örneği. Şemayı JSON Schema olarak yapıştırmayın; küçük model okuyamaz,
  insan diliyle alan listesi verin (`alan_listesi`, `iskelet`: `yz/yz/yapili/sema_araclari.py`).
- **Modelin tipik hatası:** kod çiti; Türkçe tarih/sayı; para birimini sembolden yanlış çıkarmak; ara toplamı
  toplam sanmak; boş listeyi uydurma öğeyle doldurmak; onarım isteğinde başka alanı bozmak.
- **Çıktıda denetleyin:** ayrıştırma notları; doğrulama hataları; her alanın metinde dayanağı (rakam metinde geçiyor
  mu, para birimi sembolle uyumlu mu — [küçük modeller için istem](kucuk-modeller-icin-istem.md) denetçisi).
- Ona ayrıştırıcı yazdırıyorsanız: "Düzenli ifadeyle yama yapma; dizgi durumunu izleyen okuyucu yaz; kesik çıktıda
  yarım alanı at; her onarımı not et; şu gerçek çıktılarla test yaz" deyin. Yoksa havuzdakini kullandırın.

## İlgili

- [Küçük modeller için istem](kucuk-modeller-icin-istem.md) · [Görev bölme ve zincirler](gorev-bolme-ve-zincirler.md) ·
  [Değerlendirme](degerlendirme.md) · [Araç protokolleri ve MCP](arac-protokolleri-ve-mcp.md)
- Havuz: [`cikar.py`](../../yz/yz/yapili/cikar.py) (katmanlar), [`json_onar.py`](../../yz/yz/yapili/json_onar.py) ve
  [`json_hosgorulu.py`](../../yz/yz/yapili/json_hosgorulu.py) (tam onarıcı),
  [`sema_araclari.py`](../../yz/yz/yapili/sema_araclari.py) (düzeltme, Türkçe ileti), [`gbnf.py`](../../yz/yz/yapili/gbnf.py),
  [`semalar.py`](../../yz/yz/yapili/semalar.py) (kopyalanacak şemalar)
- Kanıt: [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md) §1 ve §4; kayıtlı gerçek çıktılarla regresyon
  testi: [`test_gercek_ciktilar.py`](../../yz/tests/test_gercek_ciktilar.py)
