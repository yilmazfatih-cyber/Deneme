---
baslik: Güvensiz seri çözme ve ayrıştırıcı tuzakları
ozet: Veriyi okurken kod çalıştıran biçimler (pickle, tam YAML, eski model dosyaları), XML varlık genişlemesi ve dış varlıklar, JSON'da yinelenen anahtar ve derin iç içelik; hangi biçimin güvenli olduğu ve sınırda doğrulama.
etiketler: [guvenlik, seri-cozme, pickle, xml, json, ayristirici]
duzey: orta
guncellik: 2026-11
---

# Güvensiz seri çözme ve ayrıştırıcı tuzakları

> Bu notu ne zaman okumalı: dışarıdan gelen bir dosya ya da ileti okunurken (yükleme, kuyruk, önbellek, çerez,
> webhook, model dosyası); kodda `pickle`, `joblib`, `torch.load`, `np.load(allow_pickle=True)`, `yaml.load`, XML
> ayrıştırıcı görüldüğünde; "bu veri nasılsa bizim sistemimizden geliyor" denildiğinde.

## Temel fikir

Bazı biçimler yalnız veri değil **nesne** taşır: okunurken veriyi yazanın seçtiği sınıfı kurar, işlevi çağırır.
Python'un `pickle`'ı, tam yükleyicili YAML ve pickle tabanlı model dosyaları böyledir; güvenilmeyen kaynaktan
okunurlarsa okumak, **kod çalıştırmak** demektir. Python belgesi `pickle` için bunu açıkça uyarır.

Veri biçimlerinin kendisi güvenli olsa bile ayrıştırıcının davranışı tuzaktır: XML'de küçük bir belge varlık
genişlemesiyle belleği doldurabilir, JSON'da yinelenen anahtarı iki farklı bileşen farklı okuyabilir, çok derin
iç içe yapı ayrıştırıcıyı çökertebilir.

Kural: **güvenilmeyen veri yalnız veri biçimiyle** (JSON, CSV, `safetensors`) okunur, sınırda **boyut ve şema**
denetiminden geçer. "Bizim sistemimizden geliyor" bir güvence değildir: önbellek, kuyruk, çerez ve paylaşılan
dosya alanı çoğu zaman başkasının da yazabildiği yerlerdir.

## Karar tablosu

| Okunan şey                                 | Risk                                               | Güvenli seçim                                                                 |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pickle`, `joblib`, `shelve`, `dill`       | Okurken kod çalıştırır                             | JSON + şema; zorunluysa yalnız kendi ürettiğiniz ve imzaladığınız veri        |
| Model ağırlıkları (`.pt`, `.bin`, `.pkl`)  | Pickle tabanlı: yüklerken kod çalıştırır            | `safetensors`; PyTorch'ta `weights_only=True`; NumPy'da `allow_pickle=False`   |
| YAML                                       | Tam yükleyici nesne kurar                          | `yaml.safe_load` ([Veri biçimleri](../10-diller/veri-bicimleri.md))            |
| XML                                        | Dış varlık (dosya/ağ okuma), varlık genişlemesi    | DTD'yi reddet; Python'da `defusedxml` (kurulu paketi doğrulayın)               |
| JSON                                       | Yinelenen anahtar, dev sayı, derin iç içelik        | Boyut sınırı + katı ayrıştırma + şema                                          |
| Oturum/çerez içeriği                       | İstemci kurcalar                                   | Sunucu tarafı oturum ya da imzalı (HMAC) JSON ([Oturum](oturum-guvenligi.md))  |
| Düzenli ifadeyle ayrıştırma                | Felaket geri izleme (ReDoS)                        | Girdi sınırı; iç içe niceleyici yok ([Düzenli ifadeler](../10-diller/duzenli-ifadeler.md)) |
| Arşiv (zip/tar)                            | Dışarı yazma, sıkıştırma bombası                   | [Dosya yükleme](dosya-yukleme-guvenligi.md)                                    |

## Pickle: okumak kod çalıştırmaktır

Pickle verisi, okunurken çağrılacak işlevi ve argümanlarını kendisi söyleyebilir. Aşağıda zararsız bir kayıt
işleviyle gösterilir; gerçek bir saldırıda bu işlev herhangi bir sistem çağrısı olabilir.

```python calistir
import io
import json
import pickle

OLAYLAR: list[str] = []


def kaydet(ileti: str) -> str:  # zararsız gösterim işlevi
    OLAYLAR.append(ileti)
    return ileti


class Yuk:
    def __reduce__(self):  # pickle'a "okurken şu işlevi şu argümanla çağır" der
        return (kaydet, ("pickle.loads bir işlev çağırdı",))


veri = pickle.dumps(Yuk())

# YANLIŞ: dışarıdan gelen baytı pickle ile okumak
pickle.loads(veri)
assert OLAYLAR == ["pickle.loads bir işlev çağırdı"]  # okuma kod çalıştırdı


# Zorunluysa (eski sistemle uyum): yalnız izinli sınıfları kuran kısıtlı okuyucu
class KisitliOkuyucu(pickle.Unpickler):
    IZINLI: set[tuple[str, str]] = set()  # örn. {("datetime", "date")}; boş = hiçbir sınıf

    def find_class(self, modul: str, ad: str):
        if (modul, ad) not in self.IZINLI:
            raise pickle.UnpicklingError(f"izinsiz sınıf: {modul}.{ad}")
        return super().find_class(modul, ad)


try:
    KisitliOkuyucu(io.BytesIO(veri)).load()
    raise AssertionError("reddedilmeliydi")
except pickle.UnpicklingError:
    pass  # TEST: işlev referansı reddedildi
assert KisitliOkuyucu(io.BytesIO(pickle.dumps({"a": [1, 2, "x"]}))).load() == {"a": [1, 2, "x"]}

# DOĞRU: veri biçimi; şema sınırda
assert json.loads(json.dumps({"a": [1, 2, "x"]})) == {"a": [1, 2, "x"]}
print("tamam")
```

```cikti
tamam
```

Kısıtlı okuyucu bir **geçiş** önlemidir; asıl çözüm biçimi değiştirmektir. Havuzdaki örnekler: model dosyalarını
pickle'sız kaydeden [`ml-temel/ml_temel/persistence.py`](../../ml-temel/ml_temel/persistence.py) (NumPy dosyaları
`allow_pickle=False` ile açılır) ve ağırlıkları `safetensors` ile tutan
[`dil-modeli/dil_modeli/model_io.py`](../../dil-modeli/dil_modeli/model_io.py). İnternetten indirilen model
dosyası da güvenilmeyen veridir ([YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)).

Önbellekte ya da kuyrukta pickle kullanılıyorsa, o önbelleğe/kuyruğa yazabilen herkes uygulamanızda kod
çalıştırabilir: oraya da JSON yazın; zorunluysa içeriği HMAC ile imzalayıp okumadan önce doğrulayın.

## XML: dış varlık ve varlık genişlemesi

XML'in DTD özelliği iki saldırıya kapı açar: **dış varlık** (XXE: `<!ENTITY x SYSTEM "file:///…">` ile sunucunun
dosyasını ya da iç ağ adresini okuma) ve **varlık genişlemesi** (iç içe varlıklarla küçük bir belgenin dev metne
açılması, "milyar gülüş"). Ayrıştırıcıların varsayılanları dile, kitaplığa ve sürüme göre değişir:

```python calistir
import xml.etree.ElementTree as ET

# Dış varlık: Python'un ElementTree'si bu sürümde çözmüyor (başka kitaplık ve dillerde varsayılan farklı olabilir)
dis = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/hostname">]><r>&x;</r>'
try:
    ET.fromstring(dis)
    raise AssertionError("bu sürümde dış varlık çözülmemeliydi")
except ET.ParseError:
    pass

# Varlık genişlemesi: dört düzey iç içe varlık, iki yüz baytı on bin karaktere açar
katman = '<!ENTITY a "aaaaaaaaaa">' + "".join(
    f'<!ENTITY {u} "{("&" + a + ";") * 10}">' for a, u in [("a", "b"), ("b", "c"), ("c", "d")]
)
belge = f'<?xml version="1.0"?><!DOCTYPE r [{katman}]><r>&d;</r>'
acilan = ET.fromstring(belge).text or ""
print(f"{len(belge)} baytlık belge {len(acilan)} karaktere açıldı")


# DOĞRU (en basit): güvenilmeyen XML'de DTD'yi hiç kabul etmeyin
def xml_oku(metin: str) -> ET.Element:
    if "<!DOCTYPE" in metin.upper() or "<!ENTITY" in metin.upper():
        raise ValueError("DTD içeren XML kabul edilmez")
    return ET.fromstring(metin)


for kotu in (dis, belge):
    try:
        xml_oku(kotu)
        raise AssertionError("reddedilmeliydi")
    except ValueError:
        pass  # TEST
assert xml_oku("<fatura><tutar>125000</tutar></fatura>").find("tutar").text == "125000"
```

```cikti
202 baytlık belge 10000 karaktere açıldı
```

Bir düzey daha eklemek çıktıyı on katına çıkarır; ayrıştırıcının genişleme koruması (Python'un kullandığı expat
kitaplığının yeni sürümlerinde var) tek başına güvence sayılmaz. Gerçek projede güvenilmeyen XML için bu işe
yazılmış bir ayrıştırıcı (`defusedxml`) kullanın; e-fatura gibi standart XML'lerde de DTD gerekmez.

## JSON: yinelenen anahtar ve derinlik

- **Yinelenen anahtar:** `{"rol": "uye", "rol": "yonetici"}` geçerli JSON sayılır; Python ve JavaScript sonuncuyu
  alır, başka bir bileşen (ağ geçidi, doğrulayıcı, başka dildeki servis) ilkini alabilir. Güvenlik denetimi bir
  değeri, iş mantığı ötekini görür. Katı ayrıştırma yinelenen anahtarı reddeder (`object_pairs_hook` örneği:
  [Veri biçimleri](../10-diller/veri-bicimleri.md)).
- **Derinlik:** çok derin iç içe dizi ayrıştırıcıyı çökertir; yakalanmazsa işçi süreç düşer.

```python calistir
import json


def katı_json(metin: str, azami_bayt: int = 64 * 1024) -> object:
    if len(metin.encode()) > azami_bayt:
        raise ValueError("gövde çok büyük")  # → 413

    def cift_anahtar_yok(ciftler: list[tuple[str, object]]) -> dict:
        sozluk = {}
        for anahtar, deger in ciftler:
            if anahtar in sozluk:
                raise ValueError(f"yinelenen anahtar: {anahtar}")
            sozluk[anahtar] = deger
        return sozluk

    try:
        return json.loads(metin, object_pairs_hook=cift_anahtar_yok)
    except RecursionError:
        raise ValueError("çok derin iç içe yapı") from None


# YANLIŞ: düz json.loads yinelenen anahtarda sessizce sonuncuyu alır
assert json.loads('{"rol": "uye", "rol": "yonetici"}') == {"rol": "yonetici"}
# TEST: katı ayrıştırıcı yineleneni, derin yapıyı ve büyük gövdeyi reddeder
for kotu in ['{"rol": "uye", "rol": "yonetici"}', "[" * 100_000 + "]" * 100_000, '"' + "x" * 70_000 + '"']:
    try:
        katı_json(kotu)
        raise AssertionError("reddedilmeliydi")
    except ValueError:
        pass
assert katı_json('{"rol": "uye"}') == {"rol": "uye"}
print("tamam")
```

```cikti
tamam
```

Gövde boyutu ayrıştırmadan **önce** sınırlanır (havuzdaki API'de 64 KiB:
[`bodyLimit.ts`](../../uygulama/api/src/http/bodyLimit.ts)); ayrıştırılan değer sonra şemadan geçer
(alan izin listesi: [Erişim açıkları](erisim-denetimi-aciklari.md)).

## Tuzaklar

| Belirti                                                             | Neden                                                      | Çözüm                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| İndirilen model dosyası açılınca beklenmedik süreç başladı          | Pickle tabanlı ağırlık                                     | `safetensors`; `weights_only=True`; `allow_pickle=False`           |
| Önbelleğe yazabilen biri uygulamada komut çalıştırdı               | Önbellekte pickle                                          | JSON; ya da HMAC imzası doğrulanmadan okuma yok                    |
| Çerezdeki "oturum nesnesi" kurcalanınca yönetici olundu             | İstemciye seri hâlde nesne verildi                          | Sunucu tarafı oturum ya da imzalı JSON                             |
| XML yükleme sunucunun dosyasını yanıtta gösterdi                    | Dış varlık çözülüyor                                       | DTD reddi; `defusedxml`                                            |
| Küçük bir XML belgesi işçiyi bellek yüzünden öldürdü                | Varlık genişlemesi                                         | DTD reddi; boyut sınırı                                            |
| Ağ geçidi `rol=uye` gördü, uygulama `rol=yonetici` işledi           | Yinelenen anahtar, iki ayrıştırıcı farklı okudu            | Katı ayrıştırma; şema                                              |
| Derin iç içe gövde 500 ve süreç düşmesine yol açtı                  | `RecursionError` yakalanmadı, boyut sınırı yok             | Boyut sınırı + hatayı 400'e çevirme                                 |
| `yaml.load` uyarısı susturuldu                                      | Tam yükleyici kullanılıyor                                 | `yaml.safe_load`                                                   |

## Denetim listesi

- [ ] Güvenilmeyen kaynaktan (yükleme, ağ, önbellek, kuyruk, çerez, indirilen dosya) okunan veride `pickle`,
      `joblib`, `torch.load` (güvenli kipsiz), `np.load(allow_pickle=True)`, `yaml.load` yok.
- [ ] Model dosyaları `safetensors` ya da güvenli yükleme kipiyle.
- [ ] XML girdisinde DTD reddediliyor ya da bu işe yazılmış ayrıştırıcı kullanılıyor.
- [ ] JSON gövdeleri boyut sınırından, katı ayrıştırmadan (yinelenen anahtar) ve şemadan geçiyor; derinlik hatası 400.
- [ ] İstemciye seri hâlde nesne verilmiyor; geri gelen her şey imzalı ya da sunucuda tutuluyor.
- [ ] Testlerde pickle yükü, DTD'li XML, yinelenen anahtar, derin iç içe JSON reddediliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dışarıdan gelen veriyi yalnız JSON ile oku; boyut sınırı ve şema doğrulaması ekle. `pickle`,
  `joblib`, `yaml.load`, güvenli kipsiz `torch.load` kullanma. Model ağırlığı gerekiyorsa `safetensors`."
- **Modelin tipik hatası:** önbelleğe ya da kuyruğa nesneyi `pickle` ile koymak ("en kolayı"); `torch.load(dosya)`
  yazmak; YAML'ı `yaml.load` ile okumak; XML'i varsayılan ayrıştırıcıyla, DTD denetimi olmadan okumak; çerezde
  base64'lenmiş nesne taşımak.
- **Çıktıda denetleyin:** `pickle.load`, `joblib.load`, `torch.load(`, `allow_pickle=True`, `yaml.load(`,
  `fromstring(`/`parse(` + kullanıcı verisi, `trust_remote_code=True`.
- **Test isteyin:** yukarıdaki üç bloğun sınama girdileri (pickle yükü, DTD'li XML, yinelenen anahtar, derin JSON).

## İlgili

- [Veri biçimleri](../10-diller/veri-bicimleri.md) (YAML `safe_load`, JSON yinelenen anahtar) · [Düzenli
  ifadeler](../10-diller/duzenli-ifadeler.md) (felaket geri izleme)
- [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md) (model dosyaları) · [Dosya yükleme](dosya-yukleme-guvenligi.md)
  (arşivler) · [OWASP özeti](owasp-ozet.md) · [Güvenlik testleri](guvenlik-testleri.md)
- Çalışan kod: [`ml-temel/ml_temel/persistence.py`](../../ml-temel/ml_temel/persistence.py) (pickle'sız model
  dosyası), [`dil-modeli/dil_modeli/model_io.py`](../../dil-modeli/dil_modeli/model_io.py) (`safetensors`)
