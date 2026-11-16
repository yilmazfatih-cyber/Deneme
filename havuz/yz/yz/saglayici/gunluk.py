"""İstek/yanıt günlüğü (JSONL): her model çağrısı tek satır.

Günlüğe sır ve kişisel veri YAZILMAZ: mesaj ve yanıt metinleri `gunluk_icin_maskele`'den
geçer (TCKN, IBAN, telefon, e-posta, kart, API anahtarı…); API anahtarı zaten istek gövdesinde
bulunmaz ve başlıklar hiç kaydedilmez. Metinler `azami_karakter` ile kırpılır.
Kim kullanır: saglayici/taban.py (her çağrıdan sonra `yaz`).
Genişletme: yeni bir alan → `yaz` içindeki `kayit` sözlüğüne ekleyin; tests/test_saglayici_ortak.py
günlükte sır kalmadığını denetler.
"""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from yz.guvenlik.maske import gunluk_icin_maskele
from yz.metin import kirp
from yz.saglayici.tipler import SohbetIstegi, Yanit


class IstekGunlugu:
    """JSONL dosyasına ekleyen, iş parçacığı güvenli günlük."""

    def __init__(
        self,
        yol: str | Path,
        *,
        govde_kaydet: bool = True,
        azami_karakter: int = 2000,
        saat: Callable[[], float] = time.time,
    ) -> None:
        self.yol = Path(yol)
        self.govde_kaydet = govde_kaydet
        self.azami_karakter = azami_karakter
        self._saat = saat
        self._kilit = threading.Lock()

    def _temiz(self, metin: str) -> str:
        return kirp(gunluk_icin_maskele(metin), self.azami_karakter)

    def yaz(
        self,
        saglayici: str,
        istek: SohbetIstegi,
        yanit: Yanit | None,
        *,
        hata: str | None = None,
        maliyet: float | None = None,
    ) -> None:
        """Bir çağrıyı günlüğe ekler. `yanit` None ise çağrı hatayla bitmiştir."""
        kayit: dict[str, Any] = {
            "zaman": round(self._saat(), 3),
            "saglayici": saglayici,
            "mesaj_sayisi": len(istek.mesajlar),
            "arac_sayisi": len(istek.araclar),
            "yanit_bicimi": istek.yanit_bicimi.tur if istek.yanit_bicimi else None,
            "sicaklik": istek.sicaklik,
        }
        if self.govde_kaydet:
            kayit["mesajlar"] = [
                {"rol": m.rol, "icerik": self._temiz(m.icerik)} for m in istek.mesajlar
            ]
        if yanit is not None:
            kayit.update(
                model=yanit.model,
                bitis_nedeni=yanit.bitis_nedeni,
                girdi_belirteci=yanit.kullanim.girdi_belirteci,
                cikti_belirteci=yanit.kullanim.cikti_belirteci,
                tahmini=yanit.kullanim.tahmini,
                onbellekten=yanit.kullanim.onbellekten,
                gecikme_sn=round(yanit.gecikme_sn, 3),
                arac_cagrilari=[c.ad for c in yanit.arac_cagrilari],
            )
            if self.govde_kaydet:
                kayit["yanit"] = self._temiz(yanit.metin)
        if hata is not None:
            kayit["hata"] = self._temiz(hata)
        if maliyet is not None:
            kayit["maliyet"] = maliyet
        satir = json.dumps(kayit, ensure_ascii=False)
        with self._kilit:
            self.yol.parent.mkdir(parents=True, exist_ok=True)
            with self.yol.open("a", encoding="utf-8") as dosya:
                dosya.write(satir + "\n")
