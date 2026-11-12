"""POS'a gönderim: sipariş mesajı (JSON sözleşmesi) ve adaptörler.

Sözleşme (`sema: yemekhane-kasa/siparis@1`): her tepsi bir `siparis_no` alır. İçerik değişirse aynı numarayla
`revizyon` artar ve `islem: guncelle` gelir; alıcı taraf siparişi numarasına göre güncellemeli (upsert), en yüksek
revizyon geçerlidir. Tutarlar tamsayı kuruştur. HTTP'de her istek `Idempotency-Key: <siparis_no>/<revizyon>` taşır;
aynı anahtar ikinci kez gelirse alıcı yok saymalıdır (yeniden denemeler ve `surekli_gonder` bu yüzden zararsızdır).

Adaptörler: `HttpPos` (JSON POST), `KlasorPos` (her mesaj bir dosya; dosya izleyen POS yazılımları için),
`KonsolPos` (ekrana fiş). Başka bir POS için `gonder(mesaj) -> PosSonucu` yöntemi olan bir sınıf yeterlidir.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, TextIO

from yemekhane_kasa.ayarlar import PosAyari
from yemekhane_kasa.menu import tl
from yemekhane_kasa.takip import Siparis

log = logging.getLogger(__name__)

SEMA = "yemekhane-kasa/siparis@1"


@dataclass
class PosSonucu:
    basarili: bool
    ayrinti: str = ""
    deneme: int = 1


class PosAdaptoru(Protocol):
    def gonder(self, mesaj: dict[str, Any]) -> PosSonucu: ...


def mesaj_olustur(siparis: Siparis, kasa: str, gorsel: str | None = None) -> dict[str, Any]:
    adisyon = siparis.adisyon
    return {
        "sema": SEMA,
        "islem": siparis.islem,
        "siparis_no": siparis.no,
        "revizyon": siparis.revizyon,
        "zaman": siparis.zaman.isoformat(timespec="seconds"),
        "kasa": kasa,
        "para_birimi": "TRY",
        "kalemler": [
            {
                "menu_id": s.menu_id,
                "ad": s.ad,
                "plu": s.plu,
                "kategori": s.kategori,
                "porsiyon": s.porsiyon,
                "adet": s.adet,
                "birim_fiyat_kurus": s.birim_fiyat_kurus,
                "tutar_kurus": s.tutar_kurus,
                "kdv_orani": s.kdv_orani,
                "guven": round(s.guven, 2),
            }
            for s in adisyon.satirlar
        ],
        "indirimler": [
            {"ad": i.ad, "tutar_kurus": i.tutar_kurus, "menu_idler": i.menu_idler} for i in adisyon.indirimler
        ],
        "ara_toplam_kurus": adisyon.ara_toplam_kurus,
        "indirim_toplami_kurus": adisyon.indirim_toplami_kurus,
        "toplam_kurus": adisyon.toplam_kurus,
        "toplam_metin": tl(adisyon.toplam_kurus),
        "kdv": [{"oran": k.oran, "matrah_kurus": k.matrah_kurus, "tutar_kurus": k.tutar_kurus} for k in adisyon.kdv],
        "kontrol_gerekli": adisyon.kontrol_gerekli,
        "kontrol_nedenleri": list(adisyon.uyarilar),
        "taninmayanlar": list(adisyon.taninmayanlar),
        "gorsel": gorsel,
    }


def kapanis_mesaji(siparis: Siparis, kasa: str, zaman: str) -> dict[str, Any]:
    return {
        "sema": SEMA,
        "islem": "kapandi",
        "siparis_no": siparis.no,
        "revizyon": siparis.revizyon,
        "zaman": zaman,
        "kasa": kasa,
    }


def anahtar(mesaj: dict[str, Any]) -> str:
    return f"{mesaj['siparis_no']}/{mesaj['revizyon']}" + ("/kapandi" if mesaj["islem"] == "kapandi" else "")


def fis_metni(mesaj: dict[str, Any]) -> str:
    """İnsan okuyacağı fiş (konsol, simülatör, `dene` komutu)."""
    basliklar = {
        "yeni": "YENİ SİPARİŞ",
        "guncelle": f"GÜNCELLEME (rev. {mesaj['revizyon']})",
        "kapandi": "TEPSİ AYRILDI",
    }
    satirlar = [f"=== {basliklar.get(mesaj['islem'], mesaj['islem'])} | {mesaj['siparis_no']} | {mesaj['kasa']} ==="]
    if mesaj["islem"] == "kapandi":
        return satirlar[0]
    for k in mesaj["kalemler"]:
        ad = k["ad"] + (" (yarım)" if k["porsiyon"] == "yarim" else "")
        satirlar.append(f"  {k['adet']:>2} x {ad:<32} {tl(k['tutar_kurus']):>13}")
    if not mesaj["kalemler"]:
        satirlar.append("  (menüden eşleşen yemek yok)")
    for indirim in mesaj["indirimler"]:
        satirlar.append(f"       {indirim['ad'][:32]:<32} {tl(-indirim['tutar_kurus']):>13}")
    satirlar.append(f"  {'TOPLAM':<37} {tl(mesaj['toplam_kurus']):>13}")
    for neden in mesaj["kontrol_nedenleri"]:
        satirlar.append(f"  ! KONTROL: {neden}")
    return "\n".join(satirlar)


class HttpPos:
    """Siparişi JSON olarak POST eder. 2xx başarıdır. Ağ hatası, 408/425/429 ve 5xx kısa aralıklarla yeniden
    denenir; diğer 4xx yanıtlar yeniden denenmez (mesaj ya da adres yanlıştır)."""

    def __init__(
        self,
        adres: str,
        basliklar: dict[str, str] | None = None,
        zaman_asimi_sn: float = 2.0,
        deneme_sayisi: int = 3,
        ortam_vekili: bool = False,
        uyku: Callable[[float], None] = time.sleep,
    ) -> None:
        self.adres = adres
        self.basliklar = dict(basliklar or {})
        self.zaman_asimi_sn = zaman_asimi_sn
        self.deneme_sayisi = deneme_sayisi
        self._uyku = uyku
        # POS genelde yerel ağdadır: ortamdaki HTTP(S)_PROXY değişkenleri varsayılan olarak kullanılmaz.
        isleyiciler = [] if ortam_vekili else [urllib.request.ProxyHandler({})]
        self._acici = urllib.request.build_opener(*isleyiciler)

    def gonder(self, mesaj: dict[str, Any]) -> PosSonucu:
        govde = json.dumps(mesaj, ensure_ascii=False).encode("utf-8")
        basliklar = {"Content-Type": "application/json; charset=utf-8", "Idempotency-Key": anahtar(mesaj)}
        basliklar.update(self.basliklar)
        son_hata = ""
        for deneme in range(1, self.deneme_sayisi + 1):
            istek = urllib.request.Request(self.adres, data=govde, headers=basliklar, method="POST")
            try:
                with self._acici.open(istek, timeout=self.zaman_asimi_sn) as yanit:
                    return PosSonucu(True, f"HTTP {yanit.status}", deneme)
            except urllib.error.HTTPError as e:
                ayrinti = e.read(300).decode("utf-8", "replace").strip()
                son_hata = f"HTTP {e.code}" + (f": {ayrinti}" if ayrinti else "")
                if e.code not in (408, 425, 429) and e.code < 500:
                    return PosSonucu(False, son_hata, deneme)
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                son_hata = str(getattr(e, "reason", e))
            if deneme < self.deneme_sayisi:
                self._uyku(0.2 * 2 ** (deneme - 1))
        return PosSonucu(False, son_hata, self.deneme_sayisi)


class KlasorPos:
    """Her mesajı `<klasör>/<siparis_no>-r<revizyon>[-kapandi].json` olarak yazar (önce geçici ad, sonra taşıma:
    dosyayı izleyen program yarım dosya görmez)."""

    def __init__(self, klasor: Path) -> None:
        self.klasor = Path(klasor)

    def gonder(self, mesaj: dict[str, Any]) -> PosSonucu:
        ek = "-kapandi" if mesaj["islem"] == "kapandi" else ""
        hedef = self.klasor / f"{mesaj['siparis_no']}-r{mesaj['revizyon']}{ek}.json"
        try:
            self.klasor.mkdir(parents=True, exist_ok=True)
            gecici = hedef.with_name("." + hedef.name + ".tmp")
            gecici.write_text(json.dumps(mesaj, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(gecici, hedef)
        except OSError as e:
            return PosSonucu(False, f"yazılamadı: {e}")
        return PosSonucu(True, str(hedef))


class KonsolPos:
    def __init__(self, akis: TextIO | None = None) -> None:
        self._akis = akis

    def gonder(self, mesaj: dict[str, Any]) -> PosSonucu:
        akis = self._akis or sys.stdout
        print(fis_metni(mesaj), file=akis, flush=True)
        return PosSonucu(True, "konsol")


def pos_olustur(ayar: PosAyari, temel: Path) -> PosAdaptoru:
    if ayar.tur == "http":
        assert ayar.adres is not None
        return HttpPos(ayar.adres, ayar.basliklar, ayar.zaman_asimi_sn, ayar.deneme_sayisi, ayar.ortam_vekili)
    if ayar.tur == "klasor":
        klasor = Path(ayar.klasor)
        return KlasorPos(klasor if klasor.is_absolute() else temel / klasor)
    return KonsolPos()
