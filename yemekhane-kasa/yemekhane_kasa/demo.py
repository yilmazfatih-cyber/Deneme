"""Kamerasız, API anahtarsız uçtan uca gösterim.

Yapay "kamera kareleri" (boş tezgâh, tepsi, ışığı değişmiş aynı tepsi, tatlı eklenmiş tepsi, boşluk, ikinci müşteri)
ve her karenin "doğru tanıma" dosyası üretilir; servis bunları gerçek döngüyle işler. Görülecekler:
aynı tepsi iki kez fiyatlanmaz, eklenen tatlı aynı siparişin revizyonu olur, aynı içerikli ikinci tepsi yeni siparişdir.

    python -m yemekhane_kasa demo                 # ~15 sn, fişler ekrana
    python -m yemekhane_kasa demo --pos-adres http://127.0.0.1:8099/siparis   # pos-simulator'a gönder
"""

from __future__ import annotations

import json
import logging
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from yemekhane_kasa.ayarlar import Ayarlar
from yemekhane_kasa.kamera import KlasorKaynagi
from yemekhane_kasa.pos import PosAdaptoru
from yemekhane_kasa.servis import Servis, servis_olustur

log = logging.getLogger(__name__)

DEMO_MENU = """\
ad: Demo öğle menüsü
kdv: 10
yemekler:
  - {id: mercimek_corbasi, ad: Mercimek çorbası, fiyat: 60, yarim_fiyat: 40, kategori: corba, plu: '1001'}
  - {id: kuru_fasulye, ad: Kuru fasulye, fiyat: 120, yarim_fiyat: 75, kategori: ana_yemek, plu: '2001'}
  - {id: pirinc_pilavi, ad: Pirinç pilavı, fiyat: 55, yarim_fiyat: 35, kategori: yardimci, plu: '3001'}
  - {id: sutlac, ad: Fırın sütlaç, fiyat: 55, kategori: tatli, plu: '5001'}
  - {id: ayran, ad: Ayran, fiyat: 25, kategori: icecek, plu: '6001'}
fiks_menuler:
  - {ad: Öğle menüsü, kategoriler: [corba, ana_yemek, yardimci], fiyat: 210}
"""

BOYUT = (640, 480)
# Kamerada tepsinin durduğu alan (gerçek kurulumda 'kalibre' önizlemesine bakılarak ayarlanır)
DEMO_BOLGE = (0.08, 0.1, 0.84, 0.8)
# (merkez x, merkez y, yarıçap, yemek rengi) — tepsiye göre konum
TABAKLAR = {
    "mercimek_corbasi": ((-150, -70), 62, (232, 142, 44)),
    "kuru_fasulye": ((40, -70), 78, (168, 58, 38)),
    "pirinc_pilavi": ((-120, 85), 66, (246, 238, 214)),
    "ayran": ((150, 80), 36, (252, 252, 250)),
    "sutlac": ((30, 92), 56, (196, 130, 64)),
}


def sahne_ciz(tohum: int, tepsi: tuple[int, int] | None, yemekler: list[str], parlaklik: int = 0) -> Image.Image:
    """Yapay kamera karesi: koyu tezgâh, üstünde (varsa) tepsi ve tabaklar; hafif sensör gürültüsü."""
    rastgele = np.random.default_rng(tohum)
    zemin = np.full((BOYUT[1], BOYUT[0], 3), (58, 60, 66), dtype=np.int16)
    zemin[:, ::80] += 25  # tezgâh dokusu (sabit çizgiler)
    goruntu = Image.fromarray(np.clip(zemin, 0, 255).astype(np.uint8))
    ciz = ImageDraw.Draw(goruntu)
    if tepsi is not None:
        cx, cy = tepsi
        ciz.rounded_rectangle((cx - 250, cy - 170, cx + 250, cy + 170), radius=24, fill=(205, 186, 150))
        for ad in yemekler:
            (dx, dy), r, renk = TABAKLAR[ad]
            x, y = cx + dx, cy + dy
            ciz.ellipse((x - r - 12, y - r - 12, x + r + 12, y + r + 12), fill=(236, 238, 240), outline=(150, 150, 155))
            ciz.ellipse((x - r, y - r, x + r, y + r), fill=renk)
    dizi = np.asarray(goruntu, dtype=np.int16) + parlaklik + rastgele.normal(0, 3, (BOYUT[1], BOYUT[0], 3)).round()
    return Image.fromarray(np.clip(dizi, 0, 255).astype(np.uint8))


def _yanit(yemekler: list[str]) -> dict[str, Any]:
    return {
        "tepsi_var": True,
        "kalemler": [{"menu_id": ad, "adet": 1, "porsiyon": "tam", "guven": 0.95} for ad in yemekler],
        "taninmayanlar": [],
        "not": "",
    }


def demo_kareleri(klasor: Path) -> list[Path]:
    """Sıralı kareler + her tepsi karesinin yanında sahte tanıyıcının okuyacağı .json."""
    klasor.mkdir(parents=True, exist_ok=True)
    tepsi_a = ["mercimek_corbasi", "kuru_fasulye", "pirinc_pilavi", "ayran"]
    sahneler: list[tuple[str, tuple[int, int] | None, list[str], int]] = [
        ("00-bos-tezgah", None, [], 0),
        ("01-musteri1-tepsi", (320, 240), tepsi_a, 0),
        ("02-musteri1-isik-degisti", (320, 240), tepsi_a, 8),
        ("03-musteri1-tatli-ekledi", (320, 240), tepsi_a + ["sutlac"], 0),
        ("04-bos-tezgah", None, [], 0),
        ("05-musteri2-ayni-yemekler", (310, 250), tepsi_a, 0),
        ("06-bos-tezgah", None, [], 0),
    ]
    yollar = []
    for sira, (ad, tepsi, yemekler, parlaklik) in enumerate(sahneler):
        yol = klasor / f"{ad}.png"
        sahne_ciz(sira, tepsi, yemekler, parlaklik).save(yol)
        if tepsi is not None:
            yol.with_suffix(".json").write_text(json.dumps(_yanit(yemekler), ensure_ascii=False), encoding="utf-8")
        yollar.append(yol)
    return yollar


def demo_ayarlari(kok: Path, slayt_sn: float, aralik_sn: float) -> Ayarlar:
    (kok / "menu.yaml").write_text(DEMO_MENU, encoding="utf-8")
    ayarlar = Ayarlar.model_validate(
        {
            "menu": "menu.yaml",
            "kamera": {
                "kaynak": "kareler",
                "bolge": list(DEMO_BOLGE),
                "slayt_suresi_sn": slayt_sn,
                "cekim_araligi_sn": aralik_sn,
                "yoklama_sn": 0.2,
            },
            "tanima": {"tur": "sahte"},
            "pos": {"tur": "konsol", "kasa_adi": "demo-kasa"},
        }
    )
    ayarlar._temel = kok
    return ayarlar


def demo_calistir(
    kok: Path | None = None,
    pos: PosAdaptoru | None = None,
    saat: Callable[[], float] | None = None,
    uyku: Callable[[float], Any] | None = None,
    slayt_sn: float = 2.0,
    aralik_sn: float = 1.0,
) -> Servis:
    """Demoyu çalıştırır ve servis nesnesini döner (sayaçlar, kayıt klasörü testte okunur)."""
    if kok is None:
        kok = Path(tempfile.mkdtemp(prefix="yemekhane-demo-"))
    demo_kareleri(kok / "kareler")
    ayarlar = demo_ayarlari(kok, slayt_sn, aralik_sn)
    kaynak = KlasorKaynagi(kok / "kareler", slayt_sn, **({"saat": saat} if saat else {}))
    servis = servis_olustur(ayarlar, kaynak=kaynak, pos=pos)
    servis.calistir(**({"saat": saat} if saat else {}), uyku=uyku)
    return servis
