"""Aşama 2 — Liste denetleyicisi (awesome-lint benzeri kurallar).

Her kural bir fonksiyondur: (Belge, Ayarlar) -> list[Bulgu]. Kurallar bir
kayıt listesinde (KURALLAR) durur; denetle() hepsini sırayla çalıştırır. Bu
"kural kaydı" deseni awesome-lint'in rules/index.js dosyasındaki dizinin ve
fpb-lint'in remark eklenti listesinin aynısıdır: yeni kural = yeni fonksiyon.

Kurallar:
  girdi-bicimi        `- [Ad](url) - Açıklama.` biçimi, madde işareti, ayırıcı
  aciklama            açıklama var mı, büyük harfle başlıyor mu, noktayla bitiyor mu
  alfabetik           aynı bölüm/alt listedeki girdiler yerel alfabeye göre sıralı mı
  yinelenen-baglanti  aynı adres iki kez var mı (http/https, www, sondaki / farkı yok sayılır)
  https               http:// bağlantıya uyarı
  kisaltici           bit.ly gibi kısaltılmış adres yasak
  guvensiz-sema       javascript:, data: gibi şemalar yasak
  icindekiler         İçindekiler bağlantıları gerçek başlıklara gidiyor mu, eksik başlık var mı
  bos-bolum           girdisi olmayan içerik başlığı
  tanitim-dili        "en iyi", "ultimate" gibi reklam dili (uyarı)
  sondaki-bosluk      satır sonunda boşluk (uyarı)
  bolum-ust-siniri    bir kullanım alanında üst sınırdan fazla girdi (awesome-python modeli)
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field, replace
from urllib.parse import urlsplit

from asama1_ayristirici import Belge, Girdi, ascii_katla, ayristir, buyut, duz_metin, kucult, siralama_anahtari

# --- Bulgu ve ayarlar --------------------------------------------------------


@dataclass(frozen=True)
class Bulgu:
    kural: str
    satir: int
    mesaj: str
    onem: str = "hata"  # 'hata' derlemeyi kırar, 'uyari' kırmaz


KAPSAM_DISI = frozenset(
    {
        "contributing",
        "contribution",
        "contribute",
        "katki",
        "katkida bulunma",
        "license",
        "licence",
        "lisans",
        "footnotes",
        "dipnotlar",
        "sponsors",
        "sponsorlar",
    }
)
ICINDEKILER_ADLARI = frozenset({"contents", "table of contents", "icindekiler", "index", "dizin", "categories", "kategoriler"})


@dataclass(frozen=True)
class Ayarlar:
    madde_isareti: str = "-"  # '' verilirse her işaret serbest
    aciklama_zorunlu: bool = True
    nokta_zorunlu: bool = True
    buyuk_harf_zorunlu: bool = True
    alfabetik: bool = True
    yerel: str = "en"  # 'en', 'tr' ya da 'bayt' (dil kuralı olmadan kod noktası sırası)
    noktalama_yoksay: bool = False  # sıralarken virgül/iki nokta sayılmasın
    https_uyarisi: bool = True
    bolum_ust_siniri: int | None = None  # awesome-python: kullanım alanı başına en çok 5
    izinli_yinelenenler: frozenset[str] = field(default_factory=frozenset)
    buyuk_harf_istisnalari: frozenset[str] = frozenset({"iOS", "macOS", "npm", "pip", "uv", "jQuery", "eBPF"})


# Hazır kural setleri: farklı listeler farklı dilbilgisi kullanır. Varsayılan Ayarlar()
# yeni açacağın bir liste için en katı settir; diğerleri gerçek depoların kurallarını taklit eder.
HAZIR_AYARLAR = {
    "varsayilan": Ayarlar(),
    # sindresorhus/awesome: yeni girdi kategorinin SONUNA eklenir, alfabetik değildir.
    "awesome": Ayarlar(alfabetik=False),
    # awesome-go: alfabetik ama bayt sırasıyla; açıklamanın büyük harfle başlaması aranmaz.
    "go": Ayarlar(yerel="bayt", buyuk_harf_zorunlu=False),
    # awesome-python: sıra indirme sayısına göre, kullanım alanı başına en çok 5 girdi.
    "python": Ayarlar(alfabetik=False, bolum_ust_siniri=5),
    # free-programming-books: "* [Başlık](url) - Yazar (PDF)"; açıklama/nokta zorunlu değil.
    "fpb": Ayarlar(
        madde_isareti="*", aciklama_zorunlu=False, nokta_zorunlu=False, buyuk_harf_zorunlu=False, noktalama_yoksay=True
    ),
    # project-based-learning: "- [Başlık](url)"; açıklama yok, sıra serbest.
    "pbl": Ayarlar(aciklama_zorunlu=False, nokta_zorunlu=False, buyuk_harf_zorunlu=False, alfabetik=False),
}

KISALTICILAR = frozenset({"bit.ly", "bitly.com", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly", "cutt.ly"})
TANITIM_IFADELERI = (
    "best",
    "ultimate",
    "fastest",
    "world-class",
    "blazing",
    "revolutionary",
    "cutting-edge",
    "award-winning",
    "en iyi",
    "en hızlı",
    "muhteşem",
    "efsane",
    "rakipsiz",
    "devrim niteliğinde",
)


# --- Yardımcılar -------------------------------------------------------------


def _icerik_girdileri(belge: Belge) -> list[Girdi]:
    """İçindekiler bağlantılarını (#...) dışarıda bırakır."""
    return [g for g in belge.girdiler if not g.url.startswith("#")]


def _normal_ad(metin: str) -> str:
    return ascii_katla(kucult(metin.strip().rstrip(":"), "tr"))


def url_normallestir(url: str) -> str:
    """Aynı kaynağa giden yazım farklarını birleştirir (şema, www, sondaki /, #parça)."""
    p = urlsplit(url)
    host = (p.hostname or "").lower().removeprefix("www.")
    yol = p.path.rstrip("/")
    if host in ("github.com", "gitlab.com"):
        yol = yol.lower()  # depo adları büyük/küçük harf duyarsız
    return host + yol + (f"?{p.query}" if p.query else "")


def _aciklama(girdi: Girdi) -> str | None:
    """' - Açıklama.' biçimindeki kalandan açıklamayı çıkarır; yoksa None."""
    if girdi.kalan.startswith(" - "):
        return girdi.kalan[3:].strip()
    return None


# --- Kurallar ----------------------------------------------------------------


def kural_girdi_bicimi(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    bulgular = []
    for g in _icerik_girdileri(belge):
        if ayar.madde_isareti and g.isaret != ayar.madde_isareti:
            bulgular.append(Bulgu("girdi-bicimi", g.satir, f"Madde işareti '{ayar.madde_isareti}' olmalı"))
        k = g.kalan
        if not k or k.startswith(" - "):
            continue
        if re.match(r"^\s*[–—]\s", k):
            bulgular.append(Bulgu("girdi-bicimi", g.satir, "Ayırıcı olarak en/em tire değil '-' kullan"))
        elif re.match(r"^\s*-", k):
            bulgular.append(Bulgu("girdi-bicimi", g.satir, "Bağlantı ile açıklama tam olarak ' - ' ile ayrılmalı"))
        elif ayar.aciklama_zorunlu:
            bulgular.append(Bulgu("girdi-bicimi", g.satir, "Açıklama bağlantıdan sonra ' - ' ile gelmeli"))
        elif not k.startswith(" "):
            bulgular.append(Bulgu("girdi-bicimi", g.satir, "Bağlantıdan sonra bir boşluk bırak"))
    # "- [Ad] (url)" gibi bozuk satırlar Madde olarak kalır; burada yakalanır.
    for m in belge.maddeler:
        if m.metin.startswith("[") and "](" not in m.metin:
            bulgular.append(Bulgu("girdi-bicimi", m.satir, "Bozuk bağlantı: ']' ile '(' arasında boşluk olmamalı"))
    return bulgular


def kural_aciklama(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    bulgular = []
    for g in _icerik_girdileri(belge):
        aciklama = _aciklama(g)
        if aciklama is None:
            if ayar.aciklama_zorunlu and not g.kalan:
                bulgular.append(Bulgu("aciklama", g.satir, f"'{g.ad}' için açıklama yok"))
            continue
        if not aciklama:
            bulgular.append(Bulgu("aciklama", g.satir, "Ayırıcıdan sonra açıklama boş"))
            continue
        ilk_kelime = aciklama.lstrip("*_`\"'(").split(" ")[0]
        if ayar.buyuk_harf_zorunlu and ilk_kelime and ilk_kelime[0].isalpha():
            kucuk_basliyor = ilk_kelime[0] != buyut(ilk_kelime[0], ayar.yerel)
            icinde_buyuk_var = any(ch.isupper() for ch in ilk_kelime[1:])
            if kucuk_basliyor and not icinde_buyuk_var and ilk_kelime not in ayar.buyuk_harf_istisnalari:
                bulgular.append(Bulgu("aciklama", g.satir, "Açıklama büyük harfle başlamalı"))
        if ayar.nokta_zorunlu and not aciklama.rstrip(" )\"'*_").endswith((".", "!", "?", "…")):
            bulgular.append(Bulgu("aciklama", g.satir, "Açıklama nokta ile bitmeli"))
    return bulgular


def _gruplar(belge: Belge) -> dict[tuple, list[Girdi]]:
    """Aynı başlık + aynı blok + aynı üst madde + aynı girinti = aynı karşılaştırma grubu."""
    gruplar: dict[tuple, list[Girdi]] = defaultdict(list)
    for g in _icerik_girdileri(belge):
        gruplar[(g.bolum, g.blok, g.ust_satir, g.girinti)].append(g)
    return gruplar


def kural_alfabetik(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    if not ayar.alfabetik:
        return []
    bulgular = []
    for grup in _gruplar(belge).values():
        for onceki, sonraki in zip(grup, grup[1:]):
            a = siralama_anahtari(duz_metin(onceki.ad), ayar.yerel, ayar.noktalama_yoksay)
            b = siralama_anahtari(duz_metin(sonraki.ad), ayar.yerel, ayar.noktalama_yoksay)
            if b < a:
                bulgular.append(
                    Bulgu(
                        "alfabetik",
                        sonraki.satir,
                        f"'{sonraki.ad}', '{onceki.ad}' (satır {onceki.satir}) girdisinden önce gelmeli",
                    )
                )
    return bulgular


def kural_yinelenen(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    ilk: dict[str, int] = {}
    bulgular = []
    for g in _icerik_girdileri(belge):
        if not urlsplit(g.url).scheme:
            continue  # göreli bağlantılar (docs/x.md) yinelenebilir
        anahtar = url_normallestir(g.url)
        if anahtar in ayar.izinli_yinelenenler:
            continue
        if anahtar in ilk:
            bulgular.append(Bulgu("yinelenen-baglanti", g.satir, f"Aynı adres satır {ilk[anahtar]}'de de var: {g.url}"))
        else:
            ilk[anahtar] = g.satir
    return bulgular


def kural_url_semasi(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    bulgular = []
    for g in _icerik_girdileri(belge):
        p = urlsplit(g.url)
        sema = p.scheme.lower()
        if sema and sema not in ("http", "https", "mailto"):
            bulgular.append(Bulgu("guvensiz-sema", g.satir, f"İzin verilmeyen şema: '{sema}:'"))
        elif (p.hostname or "").lower() in KISALTICILAR:
            bulgular.append(Bulgu("kisaltici", g.satir, "Kısaltılmış adres kullanma; asıl adresi yaz"))
        elif sema == "http" and ayar.https_uyarisi:
            bulgular.append(Bulgu("https", g.satir, "Mümkünse https:// kullan", "uyari"))
    return bulgular


def _icindekiler_basligi(belge: Belge) -> int | None:
    for i, b in enumerate(belge.basliklar):
        if _normal_ad(b.metin) in ICINDEKILER_ADLARI:
            return i
    # Adı farklıysa (build-your-own-x gibi): girdilerinin hepsi #bağlantı olan ilk bölüm.
    bolumler: dict[int | None, list[Girdi]] = defaultdict(list)
    for g in belge.girdiler:
        bolumler[g.bolum].append(g)
    for bolum, girdiler in bolumler.items():
        if bolum is not None and len(girdiler) >= 3 and all(g.url.startswith("#") for g in girdiler):
            return bolum
    return None


def kural_icindekiler(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    i = _icindekiler_basligi(belge)
    if i is None:
        return []
    bulgular = []
    kimlikler = belge.kimlikler()
    kimlik_duzey = {b.kimlik: b.duzey for b in belge.basliklar}
    kimlik_duzey |= {b.acik_kimlik: b.duzey for b in belge.basliklar if b.acik_kimlik}
    katlanmis = {ascii_katla(k): k for k in kimlikler}
    toc = [g for g in belge.girdiler if g.bolum == i and g.url.startswith("#")]
    hedefler = set()
    for g in toc:
        capa = g.url[1:]
        if capa in kimlikler:
            hedefler.add(capa)
            continue
        ipucu = ""
        gercek = katlanmis.get(ascii_katla(capa))
        if gercek:
            ipucu = f" (GitHub kimliği '{gercek}'; Türkçe harfleri koru ya da başlığa <a id> ekle)"
            hedefler.add(gercek)  # başlık İçindekiler'de var, yalnızca bağlantısı bozuk
        bulgular.append(Bulgu("icindekiler", g.satir, f"'#{capa}' hiçbir başlığa gitmiyor{ipucu}"))
    if not hedefler:
        return bulgular
    duzeyler = {kimlik_duzey[h] for h in hedefler}
    # Kapsam: İçindekiler'den sonra, son hedef başlıktan sonra gelen daha üst düzey bir
    # başlığa kadar (awesome-python'daki "## Resources" gibi bölümler kapsam dışında kalır).
    son_hedef = max(b.satir for b in belge.basliklar if b.kimlik in hedefler or b.acik_kimlik in hedefler)
    for b in belge.basliklar[i + 1 :]:
        if b.satir > son_hedef and b.duzey < min(duzeyler):
            break
        if b.duzey not in duzeyler or _normal_ad(b.metin) in KAPSAM_DISI:
            continue
        if b.kimlik not in hedefler and b.acik_kimlik not in hedefler:
            bulgular.append(Bulgu("icindekiler", b.satir, f"'{b.metin}' başlığı İçindekiler'de yok"))
    return bulgular


def kural_bos_bolum(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    sayac = defaultdict(int)
    for g in _icerik_girdileri(belge):
        sayac[g.bolum] += 1
    icerik_duzeyleri = {belge.basliklar[b].duzey for b in sayac if b is not None}
    toc = _icindekiler_basligi(belge)
    bulgular = []
    for i, b in enumerate(belge.basliklar):
        if i == toc or b.duzey not in icerik_duzeyleri or _normal_ad(b.metin) in KAPSAM_DISI:
            continue
        sonraki = belge.basliklar[i + 1] if i + 1 < len(belge.basliklar) else None
        alt_basligi_var = sonraki is not None and sonraki.duzey > b.duzey
        if sayac[i] == 0 and not alt_basligi_var:
            bulgular.append(Bulgu("bos-bolum", b.satir, f"'{b.metin}' bölümünde girdi yok", "uyari"))
    return bulgular


def kural_tanitim_dili(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    bulgular = []
    for g in _icerik_girdileri(belge):
        aciklama = kucult(_aciklama(g) or "", ayar.yerel)
        for ifade in TANITIM_IFADELERI:
            if re.search(r"(?<!\w)" + re.escape(ifade) + r"(?!\w)", aciklama):
                bulgular.append(Bulgu("tanitim-dili", g.satir, f"Reklam dili: '{ifade}'; nesnel yaz", "uyari"))
                break
    return bulgular


def kural_sondaki_bosluk(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    return [
        Bulgu("sondaki-bosluk", no, "Satır sonunda boşluk var", "uyari")
        for no, satir in enumerate(belge.satirlar, start=1)
        if satir != satir.rstrip() and no not in belge.atlanan_satirlar
    ]


def kural_ust_sinir(belge: Belge, ayar: Ayarlar) -> list[Bulgu]:
    if not ayar.bolum_ust_siniri:
        return []
    bulgular = []
    for grup in _gruplar(belge).values():
        if len(grup) > ayar.bolum_ust_siniri:
            bulgular.append(
                Bulgu(
                    "bolum-ust-siniri",
                    grup[0].satir,
                    f"Bu kullanım alanında {len(grup)} girdi var; üst sınır {ayar.bolum_ust_siniri}",
                )
            )
    return bulgular


KURALLAR = [
    kural_girdi_bicimi,
    kural_aciklama,
    kural_alfabetik,
    kural_yinelenen,
    kural_url_semasi,
    kural_icindekiler,
    kural_bos_bolum,
    kural_tanitim_dili,
    kural_sondaki_bosluk,
    kural_ust_sinir,
]


def denetle(metin: str, ayar: Ayarlar | None = None, **degisiklik) -> list[Bulgu]:
    """Metni ayrıştırır, tüm kuralları çalıştırır, bulguları satıra göre sıralar."""
    ayar = replace(ayar or Ayarlar(), **degisiklik)
    belge = ayristir(metin)
    bulgular = [b for kural in KURALLAR for b in kural(belge, ayar)]
    return sorted(bulgular, key=lambda b: (b.satir, b.kural))


def bicimle(bulgular: list[Bulgu], dosya: str = "README.md") -> str:
    """Derleyici tarzı çıktı: dosya:satır: [önem] kural: mesaj"""
    return "\n".join(f"{dosya}:{b.satir}: [{b.onem}] {b.kural}: {b.mesaj}" for b in bulgular)
