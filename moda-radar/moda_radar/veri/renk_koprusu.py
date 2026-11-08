"""Renk modülüne isteğe bağlı köprü. `moda_radar.renk` yoksa (ya da bağımlılıkları kurulu değilse) boş liste döner
ve toplayıcı yalnız URL kaydeder. Görsel baytı burada işlenir ve atılır (ADR-002)."""

from __future__ import annotations

import importlib
import logging

from moda_radar.sema import Kaynak, Lab, PantoneEslesme, RenkKaydi

log = logging.getLogger(__name__)


def _modul(ad: str):
    try:
        return importlib.import_module(ad)
    except ImportError as e:  # modül ya da renk bağımlılığı (numpy vb.) eksik
        log.info("%s yüklenemedi: %s", ad, e)
        return None


def renk_modulu_var() -> bool:
    return _modul("moda_radar.renk.palet") is not None and _modul("moda_radar.renk.pantone") is not None


def lab_hex(lab: Lab) -> str:
    """CIE Lab (D65) → sRGB hex. Okunabilirlik içindir; birincil kimlik Pantone kodudur."""
    fy = (lab.L + 16) / 116
    fx, fz = fy + lab.a / 500, fy - lab.b / 200

    def ters(f: float) -> float:
        return f**3 if f**3 > 0.008856 else (f - 16 / 116) / 7.787

    x, y, z = 0.95047 * ters(fx), 1.0 * ters(fy), 1.08883 * ters(fz)
    dogrusal = (
        3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    )

    def gamma(c: float) -> int:
        c = min(1.0, max(0.0, c))
        c = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return round(c * 255)

    return "#" + "".join(f"{gamma(c):02X}" for c in dogrusal)


def _lab(x) -> Lab:
    if isinstance(x, Lab):
        return x
    if hasattr(x, "L"):
        return Lab(L=x.L, a=x.a, b=x.b)
    L, a, b = x
    return Lab(L=L, a=a, b=b)


def renk_kayitlari(bayt: bytes, kaynak: Kaynak, parca_id: str, k: int = 4) -> list[RenkKaydi]:
    """Görsel baytından baskın + vurgu RenkKaydi listesi. Renk modülü yoksa []."""
    palet, pantone = _modul("moda_radar.renk.palet"), _modul("moda_radar.renk.pantone")
    if palet is None or pantone is None:
        return []
    try:
        renkler = sorted(((_lab(lb), float(p)) for lb, p in palet.parca_renkleri(bayt, k)), key=lambda t: -t[1])
    except Exception as e:  # noqa: BLE001 — görsel çözücü her türlü hata atabilir; tek görsel taramayı düşürmesin
        log.warning("parca_renkleri başarısız (%s): %s", kaynak.url, e)
        return []
    kayitlar = []
    for i, (lab, pay) in enumerate(renkler):
        adaylar: list[PantoneEslesme] = list(pantone.en_yakin(lab, 2))
        if not adaylar:
            continue
        kayitlar.append(
            RenkKaydi(
                kaynak=kaynak,
                parca_id=parca_id,
                rol="baskin" if i == 0 else "vurgu",
                pay=min(1.0, max(0.0, pay)),
                lab=lab,
                hex=lab_hex(lab),
                pantone=adaylar[0],
                ikinci_aday=adaylar[1] if len(adaylar) > 1 else None,
            )
        )
    return kayitlar
