"""Vogue Runway toplayıcısı: `https://www.vogue.com/fashion-shows/<sezon-slug>/<marka-slug>`.

Saf ayrıştırıcı `look_urlleri(html)` ağdan bağımsızdır; ağ işi `defile_tara`'dadır. Sayfanın yapısı zamanla
değişebileceği için üç strateji sırayla denenir:

1. `window.__PRELOADED_STATE__` JSON'u — galeriler (tercihen "Collection") ve içindeki görsel URL'leri,
2. `application/ld+json` blokları — `image` / `associatedMedia` / `contentUrl`,
3. `<img>` / `<source>` galerisi — `src`, `data-src`, `srcset` içindeki `assets.vogue.com/photos/...` adresleri.

Hiçbiri tutmazsa boş liste döner ve uyarı yazılır. Görsel diske yazılmaz; renk modülü varsa bellekte işlenip atılır.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
import urllib.error
from collections.abc import Callable
from datetime import date
from html.parser import HTMLParser

from moda_radar.sema import DefileTanimi, Kaynak, KaynakTuru

log = logging.getLogger(__name__)

TABAN = "https://www.vogue.com/fashion-shows"
FOTO_DESENI = re.compile(r"https?://assets\.vogue\.com/photos/[0-9a-f]{12,}/[^\s\"'<>)]+", re.IGNORECASE)
_FOTO_KIMLIGI = re.compile(r"/photos/([0-9a-f]{12,})/", re.IGNORECASE)
_GENISLIK = re.compile(r"/w_(\d+)")
_GORSEL_UZANTI = re.compile(r"\.(jpe?g|png|webp|avif)(\?|$)", re.IGNORECASE)
_DISLANAN_GALERI = ("detail", "beauty", "front", "atmosphere", "backstage")

_TR = str.maketrans({"ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g", "ç": "c", "Ç": "c", "ö": "o",
                     "Ö": "o", "ü": "u", "Ü": "u", "&": " "})  # fmt: skip


def sezon_slug(sezon: str) -> str:
    """SS27 → spring-2027-ready-to-wear, FW27 → fall-2027-ready-to-wear."""
    m = re.fullmatch(r"(SS|FW)(\d{2})", sezon)
    if not m:
        raise ValueError(f"sezon SS27/FW27 biçiminde olmalı: {sezon!r}")
    return f"{'spring' if m[1] == 'SS' else 'fall'}-20{m[2]}-ready-to-wear"


def marka_slug(marka: str) -> str:
    """'Dolce & Gabbana' → 'dolce-gabbana', 'Chloé' → 'chloe', 'Özgür Masur' → 'ozgur-masur'."""
    s = unicodedata.normalize("NFKD", marka.translate(_TR))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def defile_url(d: DefileTanimi) -> str:
    return f"{TABAN}/{d.kaynak_kimligi}"


# Marka adı → Vogue slug adayları (sırayla denenir; `content/defileler.json`'daki kimlik her zaman ilk adaydır).
# Şema (`DefileTanimi`) alternatif alanı taşımadığı için burada tutulur. 2026-11-08 Actions çalışmasında 404 verenler.
SLUG_ADAYLARI: dict[str, tuple[str, ...]] = {
    "Versace": ("versace",),
    "Ferragamo": ("ferragamo", "salvatore-ferragamo"),
    "Burberry": ("burberry", "burberry-prorsum"),
    "JW Anderson": ("jw-anderson", "j-w-anderson"),
}


class DefileBulunamadi(OSError):
    """Tüm slug adayları 404 verdi; Vogue defileyi (henüz) yayımlamamış olabilir."""


def kimlik_adaylari(d: DefileTanimi) -> list[str]:
    """Denenecek `kaynak_kimligi` listesi: önce içerikteki, sonra `SLUG_ADAYLARI`'ndaki slug'lar (aynı sezon yolu)."""
    sezon_yolu, _, _ = d.kaynak_kimligi.rpartition("/")
    adaylar = [d.kaynak_kimligi]
    for slug in SLUG_ADAYLARI.get(d.marka, ()):
        k = f"{sezon_yolu}/{slug}" if sezon_yolu else slug
        if k not in adaylar:
            adaylar.append(k)
    return adaylar


def _404_mu(e: Exception) -> bool:
    return isinstance(e, urllib.error.HTTPError) and e.code == 404


def defile_sayfasi(d: DefileTanimi, tarayici) -> tuple[str, str]:
    """(kullanılan kaynak_kimligi, HTML). 404'te sıradaki aday denenir; hepsi 404 ise `DefileBulunamadi`."""
    denenen: list[str] = []
    for kimlik in kimlik_adaylari(d):
        try:
            return kimlik, tarayici.metin(f"{TABAN}/{kimlik}")
        except urllib.error.HTTPError as e:
            if not _404_mu(e):
                raise
            denenen.append(kimlik.rsplit("/", 1)[-1])
    raise DefileBulunamadi(
        f"404 (denenen: {', '.join(denenen)}) — Vogue bu defileyi yayımlamamış olabilir; bu durumda hata normaldir"
    )


# --- saf ayrıştırıcı ---


def _foto_kimligi(url: str) -> str:
    m = _FOTO_KIMLIGI.search(url)
    return m[1] if m else url


def _genislik(url: str) -> int:
    m = _GENISLIK.search(url)
    return int(m[1]) if m else 0


def _tekille(urller: list[str]) -> list[str]:
    """Aynı fotoğrafın farklı boyutlarını tek URL'ye indirger (en geniş), ilk görülme sırasını korur."""
    sira: list[str] = []
    en_iyi: dict[str, str] = {}
    for u in urller:
        u = u.replace("\\u002F", "/").replace("&amp;", "&").rstrip("\\,")
        if not FOTO_DESENI.fullmatch(u) and not _GORSEL_UZANTI.search(u):
            continue
        k = _foto_kimligi(u)
        if k not in en_iyi:
            sira.append(k)
            en_iyi[k] = u
        elif _genislik(u) > _genislik(en_iyi[k]):
            en_iyi[k] = u
    return [en_iyi[k] for k in sira]


def _json_sonra(html: str, isaret: str):
    i = html.find(isaret)
    if i < 0:
        return None
    j = html.find("{", i + len(isaret))
    if j < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(html[j:])[0]
    except json.JSONDecodeError:
        return None


def _url_topla(dugum, cikti: list[str]) -> None:
    if isinstance(dugum, str):
        cikti.extend(FOTO_DESENI.findall(dugum))
    elif isinstance(dugum, dict):
        for v in dugum.values():
            _url_topla(v, cikti)
    elif isinstance(dugum, list):
        for v in dugum:
            _url_topla(v, cikti)


def _galeriler(dugum, cikti: list[dict]) -> None:
    """Durum ağacındaki `galleries` / `runwayShowGalleries` listelerini bulur."""
    if isinstance(dugum, dict):
        for k, v in dugum.items():
            if k.lower() in ("galleries", "runwayshowgalleries") and isinstance(v, list):
                cikti.extend(g for g in v if isinstance(g, dict))
            else:
                _galeriler(v, cikti)
    elif isinstance(dugum, list):
        for v in dugum:
            _galeriler(v, cikti)


def _strateji_durum(html: str) -> list[str]:
    durum = _json_sonra(html, "__PRELOADED_STATE__")
    if durum is None:
        return []
    galeriler: list[dict] = []
    _galeriler(durum, galeriler)
    if galeriler:

        def baslik(g: dict) -> str:
            return str(g.get("title") or g.get("slug") or g.get("name") or "").lower()

        koleksiyon = [g for g in galeriler if "collection" in baslik(g)]
        secilen = koleksiyon or [g for g in galeriler if not any(d in baslik(g) for d in _DISLANAN_GALERI)]
        urller: list[str] = []
        for g in secilen:
            _url_topla(g.get("items", g), urller)
        if urller:
            return urller
    urller = []
    _url_topla(durum, urller)
    return urller


def _strateji_jsonld(html: str) -> list[str]:
    urller: list[str] = []
    for m in re.finditer(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", html, re.DOTALL | re.IGNORECASE):
        try:
            veri = json.loads(m[1])
        except json.JSONDecodeError:
            continue
        _url_topla(veri, urller)
    return urller


class _GorselAyiklayici(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urller: list[str] = []

    def handle_starttag(self, etiket: str, nitelikler: list[tuple[str, str | None]]) -> None:
        if etiket not in ("img", "source"):
            return
        for ad, deger in nitelikler:
            if deger and ad in ("src", "data-src", "srcset", "data-srcset"):
                self.urller.extend(FOTO_DESENI.findall(deger))


def _strateji_img(html: str) -> list[str]:
    p = _GorselAyiklayici()
    p.feed(html)
    return p.urller


STRATEJILER: tuple[tuple[str, Callable[[str], list[str]]], ...] = (
    ("preloaded_state", _strateji_durum),
    ("json_ld", _strateji_jsonld),
    ("img", _strateji_img),
)


def look_urlleri(html: str) -> list[str]:
    """Defile sayfasının HTML'inden look görsel URL'lerini sırasıyla çıkarır (tekil, en geniş boyut)."""
    for ad, strateji in STRATEJILER:
        urller = _tekille(strateji(html))
        if urller:
            log.debug("vogue: %s stratejisi %d görsel buldu", ad, len(urller))
            return urller
    log.warning("vogue: hiçbir strateji görsel bulamadı (sayfa yapısı değişmiş olabilir)")
    return []


# --- ağ ---


def defile_tara(
    depo,
    d: DefileTanimi,
    tarayici,
    *,
    bugun: date | None = None,
    gorsel_siniri: int | None = None,
    renk_k: int = 4,
) -> dict:
    """Tek defileyi tarar: sayfa → look URL'leri → `gorsel` tablosu; renk modülü varsa her görseli bellekte işler.

    Sayfa HTML'i ve görsel baytı hiçbir yerde saklanmaz. Dönen sözlük: bulunan, kaydedilen, renkli, nitelikli, hata.
    """
    from moda_radar.veri import nitelik_koprusu, renk_koprusu

    bugun = bugun or date.today()
    if d.kaynak != "vogue":
        return {"defile": d.kaynak_kimligi, "atlandi": f"kaynak {d.kaynak} için toplayıcı yok"}
    kimlik, html = defile_sayfasi(d, tarayici)
    if kimlik != d.kaynak_kimligi:
        log.info("vogue: %s için alternatif slug kullanıldı: %s (içerikte: %s)", d.marka, kimlik, d.kaynak_kimligi)
        d = d.model_copy(update={"kaynak_kimligi": kimlik})
    url = defile_url(d)
    urller = look_urlleri(html)
    del html
    if not urller:  # galeri ayrı sayfada olabilir
        try:
            urller = look_urlleri(tarayici.metin(url + "/slideshow/collection"))
        except urllib.error.HTTPError as e:
            if not _404_mu(e):
                raise
    if gorsel_siniri:
        urller = urller[:gorsel_siniri]
    defile_id = depo.ekle_defile(d)
    renk_var = renk_koprusu.renk_modulu_var()
    nitelik_var = nitelik_koprusu.nitelik_acik()
    sonuc = {"defile": d.kaynak_kimligi, "bulunan": len(urller), "kaydedilen": 0, "renkli": 0, "hata": 0}
    sonuc["nitelikli"] = 0
    for sira, gurl in enumerate(urller, start=1):
        gorsel_id = depo.ekle_gorsel(defile_id, gurl, bugun, sira)
        sonuc["kaydedilen"] += 1
        if not (renk_var or nitelik_var):
            continue
        try:
            bayt = tarayici.getir(gurl, kabul="image/*")
        except (OSError, RuntimeError) as e:  # ağ hatası ya da robots yasağı
            log.warning("görsel alınamadı %s: %s", gurl, e)
            sonuc["hata"] += 1
            continue
        kaynak = Kaynak(tur=KaynakTuru.PODYUM, url=gurl, tarama_tarihi=bugun, sezon=d.sezon, marka=d.marka)
        kayitlar = renk_koprusu.renk_kayitlari(bayt, kaynak, parca_id=f"{gorsel_id}-tam", k=renk_k) if renk_var else []
        if nitelik_var:  # renk köprüsüne paralel; görsel bu çağrıdan sonra düşer
            sonuc["nitelikli"] += nitelik_koprusu.etiketle_ve_kaydet(depo, bayt, kaynak, gorsel_id, gorsel_id) > 0
        del bayt  # ADR-002: bayt atılır
        if kayitlar:
            depo.ekle_parca_renk(kayitlar, gorsel_id=gorsel_id)
            sonuc["renkli"] += 1
    return sonuc
