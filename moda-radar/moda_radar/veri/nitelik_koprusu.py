"""Görsel modülüne isteğe bağlı köprü (renk_koprusu ile aynı desen). `ANTHROPIC_API_KEY` yoksa ya da
`moda_radar.gorsel` / `anthropic` yüklenemezse sessizce boş liste döner ve bir kez uyarı yazar. Görsel baytı
burada işlenir ve atılır (ADR-002, ADR-006)."""

from __future__ import annotations

import importlib
import logging
import os

from moda_radar.sema import Kaynak, NitelikKaydi

log = logging.getLogger(__name__)

_uyarildi = False
_etiketleyici = None


def _modul(ad: str):
    try:
        return importlib.import_module(ad)
    except ImportError as e:
        log.info("%s yüklenemedi: %s", ad, e)
        return None


def _bir_kez_uyar(mesaj: str) -> None:
    global _uyarildi
    if not _uyarildi:
        log.warning(mesaj)
        _uyarildi = True


def nitelik_acik() -> bool:
    """Etiketleme yapılabilir mi: anahtar var, görsel modülü ve anthropic paketi yüklenebiliyor."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        _bir_kez_uyar("nitelik etiketleme kapalı: ANTHROPIC_API_KEY yok")
        return False
    if _modul("moda_radar.gorsel.etiketle") is None or _modul("anthropic") is None:
        _bir_kez_uyar("nitelik etiketleme kapalı: moda_radar.gorsel ya da anthropic paketi yok")
        return False
    return True


def _etiketleyici_al():
    global _etiketleyici
    if _etiketleyici is None:
        _etiketleyici = _modul("moda_radar.gorsel.etiketle").Etiketleyici()
    return _etiketleyici


def nitelik_kayitlari(goruntu: bytes, kaynak: Kaynak, gorsel_id: str, parca_onek: str) -> list[NitelikKaydi]:
    """Görsel baytından NitelikKaydi listesi; etiketleme kapalıysa ya da hata olursa []."""
    if not nitelik_acik():
        return []
    try:
        return _etiketleyici_al().etiketle(goruntu, kaynak, parca_onek=parca_onek, gorsel_id=gorsel_id)
    except Exception as e:  # noqa: BLE001 — etiketleyici istisna atmamalı; yine de tek görsel taramayı düşürmesin
        log.warning("nitelik etiketleme başarısız (%s): %s", kaynak.url, e)
        return []


def zaten_etiketli(depo, gorsel_id: str) -> bool:
    """Bu görselin toplu (denetim olmayan) etiketi var mı. Haftalık yeniden taramada API maliyetini önler."""
    satir = depo.baglanti.execute(
        "SELECT 1 FROM parca_nitelik WHERE gorsel_id = ? AND denetim = 0 LIMIT 1", (gorsel_id,)
    ).fetchone()
    return satir is not None


def etiketle_ve_kaydet(depo, goruntu: bytes, kaynak: Kaynak, gorsel_id: str, parca_onek: str) -> int:
    """Etiketler ve `parca_nitelik` tablosuna yazar; yazılan kayıt sayısını döner. Görsel zaten etiketliyse
    API çağrılmaz ve 0 döner (yeniden etiketlemek için önce o görselin kayıtları silinir)."""
    if zaten_etiketli(depo, gorsel_id):
        return 0
    kayitlar = nitelik_kayitlari(goruntu, kaynak, gorsel_id, parca_onek)
    return depo.ekle_parca_nitelik(kayitlar, gorsel_id=gorsel_id) if kayitlar else 0
