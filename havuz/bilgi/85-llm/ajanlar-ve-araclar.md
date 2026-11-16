---
baslik: Ajanlar ve araçlar
ozet: Ajan ne zaman gerekir (çoğu zaman gerekmez), araç tasarım kuralları, döngü tasarımı (adım sınırı, durma koşulu, bütçe), hata kipleri, insan onayı ve küçük modelde araç çağrısının güvenilirliği.
etiketler: [llm, ajan, arac, dongu, onay, guvenilirlik]
duzey: orta
guncellik: 2026-11
---

# Ajanlar ve araçlar

> Bu notu ne zaman okumalı: Modelin hesap makinesi, veritabanı, dosya, e-posta gibi araçları kendisinin seçip
> çağırmasını düşündüğünüzde; kurulu bir ajan döngüye girdiğinde, yanlış aracı seçtiğinde ya da uydurma argüman
> verdiğinde; dünyayı değiştiren bir aracı (ödeme, silme, gönderme) modele açmadan önce.

## Temel fikir

Ajan bir döngüdür: model ne yapacağına karar verir (araç çağrısı ya da yanıt), kod aracı çalıştırır, sonuç
(gözlem) modele geri döner, model yeniden karar verir. Esnektir ama **en az güvenilir** kalıptır: her adım bir hata
fırsatıdır ve adım sayısı önceden bilinmez. Adımları önceden bilinen bir iş ajan değil, **sabit zincirdir**
([zincirler](gorev-bolme-ve-zincirler.md)). Küçük modelde araç seçimi zayıftır: havuzdaki gerçek denemede 0,5B model
aritmetik sorularda 10 kez tarih aracını, 2 kez hesap aracını çağırdı; 10 sorudan 1'ini doğru yanıtladı
([gerçek deneme](../../yz/docs/GERCEK_MODEL_DENEMESI.md) §3). Ajan kurarsanız: az ve dar araç, iyi hata iletisi,
adım/bütçe sınırı, döngü algılama ve dünyayı değiştiren her araç için onay.

## Karar tablosu: ajan gerekir mi?

| Durum                                                            | Seçim                                              | Neden                                          |
| ---------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Hangi aracın çağrılacağı girdiden kuralla belli                  | **Kod çağırır**; model yalnız argüman/yanıt yazar   | Araç seçimi hatası ortadan kalkar              |
| Adımlar sabit (al → hesapla → yaz)                               | Sabit zincir                                       | Öngörülebilir, test edilebilir                 |
| Tek araç çağrısı yeter, aracı model seçmeli (2–4 araç)           | Tek tur araç çağrısı, döngü yok                    | Döngünün riskleri olmadan esneklik             |
| Adım sayısı girdiye göre değişiyor (arama → oku → yeniden ara)    | Ajan, sıkı sınırlarla                              | Gerçekten keşif gerekiyor                      |
| Araç dünyayı değiştiriyor (ödeme, e-posta, silme, kayıt)         | Ajan öneri üretir, **insan onaylar**               | Geri alınamaz hata; istem enjeksiyonu riski    |
| Model küçük ve araç seçimi ölçülmedi                              | Önce görev kümesiyle ölçün                         | Gerçek denemede araç seçimi tutmadı            |

## Araç tasarım kuralları

| Kural                                                   | İyi örnek                                                   | Kötü örnek                                  |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Az araç (bir çağrıda görünen 3–7)                       | İşe göre araç alt kümesi                                    | Her çağrıda 30 araç                         |
| Ad: eylem + nesne, açık                                 | `siparis_durumu_getir`                                      | `islem`, `yardimci2`                        |
| İlk açıklama cümlesi ne zaman kullanılacağını söyler     | "Sipariş numarasıyla kargonun durumunu getirir."             | "Siparişle ilgili işler."                   |
| Dar: tek iş                                             | `kur_cevir(tutar, kaynak)`                                  | `finans(islem, parametreler)`               |
| Parametre az, tipli, örnekli; sabit seçenekte enum      | `tarih: "YYYY-AA-GG", ör. 2026-03-01`                       | `veri: string`                              |
| Hata iletisi: ne oldu + nasıl düzeltilir + geçerli seçenekler | "Sipariş bulunamadı: numara 'S-' ile başlar, ör. S-1042" | "Error 404"                                 |
| Çıktı kısa, yapılı; uzunsa kırpılır                      | `{"durum": "yolda", "tahmini": "2026-03-04"}`               | 40 KB ham JSON                              |
| Okuma ve yazma ayrı araç                                | `kayit_oku`, `kayit_guncelle` (tehlikeli)                   | `kayit(islem)`: oku da siler de             |
| Yinelenebilir (idempotent) ya da istek kimlikli          | Aynı istek kimliğiyle ikinci çağrı yeni kayıt açmaz          | Zaman aşımı sonrası yeniden deneme çift ödeme yapar |
| Yetki en dar                                            | Salt-okunur veritabanı bağlantısı, tek klasör               | Yönetici hesabıyla tüm sistem               |

Havuzdaki karşılıklar: Python işlevinden araç tanımı (tip ipucu + belge dizgisi → şema) `yz/yz/arac/tanim.py`;
kopyalanacak örnek `yz/ornekler/kendi_aracim.py`; hazır araçlar (güvenli hesap, tarih, korumalı klasörde dosya,
salt-okunur SQLite, belge araması) `yz/yz/arac/hazir/`.

## Döngü tasarımı

Her ajan döngüsünde şu sınırlar **kodda** olmalı (havuzdaki varsayılanlar `yz/yz/ajan/dongu.py`, `AjanAyari`):

| Sınır / durma koşulu             | Havuz varsayılanı          | Ne korur                                   |
| -------------------------------- | -------------------------- | ------------------------------------------ |
| Azami adım                       | 6                          | Sonsuz döngü; sınırda araçsız son yanıt istenir |
| Aynı araç + aynı argüman sınırı  | 2                          | Model ilerlemeden aynı çağrıyı yineliyor   |
| Ardışık araç hatası sınırı       | 3                          | Model hatayı düzeltemiyor                  |
| Toplam belirteç bütçesi          | isteğe bağlı               | Maliyet ve gecikme patlaması               |
| Tek çağrının çıktı sınırı        | 600 belirteç               | Uzun, döngüsel düşünme metni               |
| Gözlem uzunluğu                  | 3000 karakter              | Araç çıktısı bağlamı doldurmasın           |
| Boş yanıt / ret                  | durdur                     | Sessiz başarısızlık                        |

```python calistir
import ast
import json
import operator

ISLEM = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
         ast.USub: operator.neg}


def hesapla(ifade: str) -> str:
    """Aritmetik ifadeyi hesaplar (eval yok: yalnız sayı ve + - * /)."""
    if "," in ifade:
        raise ValueError("ondalık için nokta kullan: 0,18 yerine 0.18")

    def deger(d: ast.AST) -> float:
        if isinstance(d, ast.Constant) and isinstance(d.value, (int, float)):
            return d.value
        if isinstance(d, ast.BinOp) and type(d.op) in ISLEM:
            return ISLEM[type(d.op)](deger(d.left), deger(d.right))
        if isinstance(d, ast.UnaryOp) and type(d.op) in ISLEM:
            return ISLEM[type(d.op)](deger(d.operand))
        raise ValueError("yalnız sayı ve + - * / kullan")

    return str(deger(ast.parse(ifade, mode="eval").body))


ARACLAR = {"hesapla": hesapla}


def ajan(model, gorev: str, azami_adim: int = 5, ayni_cagri_siniri: int = 2, ardisik_hata_siniri: int = 3):
    gecmis, sayac, ardisik_hata = [f"GÖREV: {gorev}"], {}, 0
    for _ in range(azami_adim):
        karar = json.loads(model("\n".join(gecmis)))
        if "yanit" in karar:
            return karar["yanit"], "yanit"
        ad, girdi = karar.get("arac"), karar.get("girdi", {})
        anahtar = f"{ad}:{json.dumps(girdi, sort_keys=True)}"
        sayac[anahtar] = sayac.get(anahtar, 0) + 1
        if sayac[anahtar] > ayni_cagri_siniri:
            return None, "dongu"  # aynı araç + aynı argüman: model ilerlemiyor
        if ad not in ARACLAR:
            gozlem, ardisik_hata = f"HATA: '{ad}' diye araç yok. Kullanılabilenler: {', '.join(ARACLAR)}", ardisik_hata + 1
        else:
            try:
                gozlem, ardisik_hata = f"SONUÇ: {ARACLAR[ad](**girdi)}", 0
            except (TypeError, ValueError) as hata:  # araç hatası istisna değil, GÖZLEM olur
                gozlem, ardisik_hata = f"HATA: {hata}", ardisik_hata + 1
        if ardisik_hata >= ardisik_hata_siniri:
            return None, "hata_dongusu"
        gecmis += [json.dumps(karar, ensure_ascii=False), gozlem]
    return None, "adim_siniri"


def betikli(yanitlar: list[dict]):
    kalan = [json.dumps(y, ensure_ascii=False) for y in yanitlar]
    return lambda istem: kalan.pop(0)


iyi = betikli([{"arac": "topla", "girdi": {"a": 1250}},                       # olmayan araç
               {"arac": "hesapla", "girdi": {"ifade": "1250*0,18"}},          # Türkçe ondalık
               {"arac": "hesapla", "girdi": {"ifade": "1250*0.18"}},
               {"yanit": "KDV 225 TL."}])
print(ajan(iyi, "1250 TL'nin %18 KDV'si ne kadar?"))
takilan = betikli([{"arac": "hesapla", "girdi": {"ifade": "2+2"}}] * 5)
print(ajan(takilan, "2+2?"))
try:
    hesapla("__import__('os').system('ls')")
except ValueError as hata:
    print("reddedildi:", hata)
```

```cikti
('KDV 225 TL.', 'yanit')
(None, 'dongu')
reddedildi: yalnız sayı ve + - * / kullan
```

Gözlemler: olmayan araç ve Türkçe ondalık gibi hatalar **istisna olarak döngüyü düşürmez**; ne yapılacağını söyleyen
bir gözlem olur ve model düzeltir. Hesap aracı `eval` kullanmaz; ifade AST ile yalnız izinli işlemlerle hesaplanır
(havuz: `yz/yz/arac/hazir/hesap.py`; kural testi `eval/exec` kullanımını yasaklar).

## Hata kipleri

| Hata kipi                     | Belirti                                                  | Önlem                                                         |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Sonsuz döngü                  | Aynı çağrı yineleniyor, adım sınırına dayanıyor          | Aynı çağrı sayacı + uyarı + durdurma; azami adım              |
| Yanlış araç                   | Hesap sorusuna tarih aracı                               | Az araç; net ilk cümle; aracı kod seçsin; görev kümesiyle ölçün |
| Uydurma argüman               | Var olmayan sipariş no, uydurma e-posta adresi           | Argümanı girdide/bağlamda arayın; bilinmiyorsa kullanıcıya sordurun |
| Gözlemi yanlış okuma          | Araç "bulunamadı" dedi, model "yolda" yazdı              | Gözlemi kısa ve açık yazın; yanıttaki değeri gözlemde arayın  |
| Erken yanıt                   | Araç çağırmadan tahminle yanıt                           | Görev "araç gerektirir" ise yanıtta araç sonucu var mı denetleyin |
| Hata iletisini yok sayma      | Aynı hatalı argümanla yeniden çağrı                       | Hata iletisi düzeltme örneği içersin; ardışık hata sınırı     |
| Kendi gözlemini uydurma (metin kipi) | Model "Gözlem: …" satırını kendisi yazıyor        | "Gözlem:" durdurma dizgisi; uydurulan kısmı kesin (havuz: metin kipi) |
| Araç çıktısındaki talimatı uygulama | Web sayfası/belge "şunu e-postala" diyor           | Araç çıktısı veridir; tehlikeli araçta onay ([LLM güvenliği](llm-guvenligi.md)) |
| Bağlam taşması                | Uzun araç çıktıları birikiyor                            | Gözlemi kırpın; eski adımları özetleyin                        |

## İnsan onayı ve yinelenebilirlik

Dünyayı değiştiren araç **varsayılan olarak çalışmaz**; onay kancası verilirse sorulur. Onay ekranında model değil
kod, ne yapılacağını insan diliyle özetler (alıcı, tutar, dosya). Zaman aşımından sonra yeniden deneme çift işlem
yapmasın diye yazma araçları istek kimliği alır.

```python calistir
from dataclasses import dataclass
from typing import Callable


@dataclass
class Arac:
    ad: str
    islev: Callable[..., str]
    tehlikeli: bool = False  # dünyayı değiştiriyor mu (e-posta, ödeme, silme, kayıt)


def cagir(arac: Arac, girdi: dict, onay: Callable[[str, dict], bool] | None = None) -> str:
    if arac.tehlikeli and not (onay and onay(arac.ad, girdi)):
        return "REDDEDİLDİ: bu işlem onay ister. Kullanıcıya ne yapılacağını yaz ve onayını iste."
    return arac.islev(**girdi)


siparisler: dict[str, str] = {}


def siparis_olustur(istek_kimligi: str, urun: str) -> str:
    """Yinelenebilir (idempotent): aynı istek kimliğiyle ikinci çağrı yeni sipariş AÇMAZ."""
    if istek_kimligi not in siparisler:
        siparisler[istek_kimligi] = f"S-{len(siparisler) + 1} ({urun})"
    return siparisler[istek_kimligi]


arac = Arac("siparis_olustur", siparis_olustur, tehlikeli=True)
girdi = {"istek_kimligi": "k-7f3a", "urun": "toner"}
print(cagir(arac, girdi))  # onay kancası yok: varsayılan ret
assert siparisler == {}


def onay_ver(ad: str, girdi: dict) -> bool:  # gerçekte: kullanıcıya özet gösterilip sorulur
    return girdi["urun"] in {"toner", "kağıt"}


print(cagir(arac, girdi, onay_ver), "|", cagir(arac, girdi, onay_ver))  # zaman aşımı sonrası yeniden deneme
assert len(siparisler) == 1  # yinelenen çağrı ikinci sipariş açmadı
```

```cikti
REDDEDİLDİ: bu işlem onay ister. Kullanıcıya ne yapılacağını yaz ve onayını iste.
S-1 (toner) | S-1 (toner)
```

Havuz: `tehlikeli=True` araç onay kancası olmadan çalışmaz (`yz/yz/arac/kutu.py`), onay kancaları
`yz/yz/ajan/onay.py`, ada göre izin listesi `yz/yz/guvenlik/izin.py`. MCP üzerinden tehlikeli araç yayımlanmaz
([araç protokolleri ve MCP](arac-protokolleri-ve-mcp.md)).

## Küçük modelde araç çağrısı

- **Yerel araç çağrısı yoksa metin kipi:** model `Eylem: hesapla` / `Girdi: {...}` yazar, kod ayrıştırır. Küçük
  modeller `<tool_call>{...}</tool_call>`, `hesapla("2+2")` ya da düz JSON da yazar; ayrıştırıcı hepsini tanımalı
  (`yz/yz/ajan/metin_kipi.py`). "Gözlem:" durdurucu olmalı.
- **Aracı mümkünse kod seçsin:** küçük model "niyet" etiketini (sınıflandırma) ya da argümanları (çıkarım) yazsın;
  hangi aracın çalışacağına kod karar versin. Bu, ajanı zincire çevirir.
- **Her soruda az araç gösterin:** soru türüne göre 1–3 araç.
- **Sayısal yanıtı puanlarken** modelin soruyu yinelediğini unutmayın: gerçek denemede doğru hesaplanan tek yanıt,
  soru yanıtta yinelendiği için "ilk sayı" ölçütünü kaçırdı; ölçüt "son sayı" yapıldı (`yz/gorevler/arac_kullanimi.yaml`).
- Ajanı ancak `python -m yz degerlendir gorevler/arac_kullanimi.yaml` benzeri bir kümeyle ölçüp kabul edin.

## Tuzaklar

| Belirti                                                    | Neden                                                   | Çözüm                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Ajan basit işte pahalı ve yavaş                            | Sabit zincirle çözülecek iş ajana verildi               | Zincire çevirin; ajanı ölçülmüş kazançla tutun                |
| Araç hatası programı düşürüyor                             | İstisna gözleme çevrilmedi                              | Araç çağrısı her durumda gözlem metni döndürsün               |
| Model aynı aracı aynı argümanla yineliyor                  | İlerleme yok; gözlem anlaşılmadı                        | Yineleme sayacı; gözlemi netleştirin; durdurun                |
| Çift sipariş/çift e-posta                                  | Zaman aşımında yeniden deneme, araç yinelenebilir değil | İstek kimliği; önce "var mı" denetimi                         |
| Onay ekranı modelin yazdığı özeti gösteriyor               | Model özeti çarpıtabilir (ya da enjeksiyon)              | Onay özetini argümanlardan kod üretsin                        |
| Araç çıktısı bağlamı dolduruyor                            | Ham çıktı kırpılmadan döndü                             | Gözlem sınırı; yalnız gerekli alanlar                         |
| Küçük model aracı hiç çağırmıyor ya da biçimi bozuyor      | Sunucu araç çağrısını desteklemiyor ya da model zayıf   | Metin kipi + hoşgörülü ayrıştırıcı; aracı kod seçsin          |

## Denetim listesi

- [ ] Ajan yerine zincir ya da kodun aracı seçtiği yol denendi ve ölçüldü.
- [ ] Her çağrıda en çok 3–7 araç; adları eylem + nesne; ilk açıklama cümlesi net.
- [ ] Parametreler tipli, örnekli; hata iletileri düzeltme yolunu söylüyor.
- [ ] Azami adım, aynı çağrı sınırı, ardışık hata sınırı, belirteç bütçesi ve gözlem sınırı kodda.
- [ ] Araç hataları istisna değil gözlem; döngü hiçbir araç hatasında düşmüyor.
- [ ] Dünyayı değiştiren araçlar `tehlikeli`; onaysız çalışmıyor; onay özeti koddan geliyor.
- [ ] Yazma araçları yinelenebilir (istek kimliği).
- [ ] Araç yetkileri en dar (salt-okunur bağlantı, tek klasör).
- [ ] Her adım dökümde (araç, argüman, gözlem, süre); bir görev kümesiyle başarı oranı ölçüldü.

## Küçük modele yaptırırken

- **Araç yazdırırken isteme yazın:** "Tek iş yapan, tip ipuçlu bir işlev yaz. Belge dizgisinin ilk cümlesi aracın
  ne zaman kullanılacağını söylesin. Hatada ne yapılacağını söyleyen Türkçe bir istisna fırlat. Dünyayı değiştiriyorsa
  `tehlikeli=True` yap. Başarılı ve hatalı argümanla test yaz." Örnek: `yz/ornekler/kendi_aracim.py`.
- **Modelin tipik hatası:** genel amaçlı tek araç (`islem(tur, veri)`) yazmak; `eval` ile hesap; hata yerine boş
  dize döndürmek; tehlikeli aracı işaretlememek; döngüye sınır koymamak.
- **Çıktıda denetleyin:** `eval`/`exec` yok; her araçta hata yolu testi var; tehlikeli araçlar işaretli; döngü
  sınırları ayarda; araç sayısı az.
- Ajan çalıştırırken dökümü okuyun (`yz/yz/web/kayit.html` JSONL dökümü açar): hangi adımda yanlış araç, hangi
  gözlemde yanlış okuma.

## İlgili

- [Görev bölme ve zincirler](gorev-bolme-ve-zincirler.md) · [Araç protokolleri ve MCP](arac-protokolleri-ve-mcp.md) ·
  [LLM güvenliği](llm-guvenligi.md) · [Değerlendirme](degerlendirme.md)
- Havuz: [`dongu.py`](../../yz/yz/ajan/dongu.py) (döngü ve durma nedenleri), [`metin_kipi.py`](../../yz/yz/ajan/metin_kipi.py)
  (ReAct ayrıştırıcı), [`tanim.py`](../../yz/yz/arac/tanim.py), [`kutu.py`](../../yz/yz/arac/kutu.py),
  [`onay.py`](../../yz/yz/ajan/onay.py), [`kendi_aracim.py`](../../yz/ornekler/kendi_aracim.py),
  [`coklu_ajan.py`](../../yz/ornekler/coklu_ajan.py)
- Ölçüm kümesi: [`arac_kullanimi.yaml`](../../yz/gorevler/arac_kullanimi.yaml); kanıt:
  [GERCEK_MODEL_DENEMESI](../../yz/docs/GERCEK_MODEL_DENEMESI.md) §3
