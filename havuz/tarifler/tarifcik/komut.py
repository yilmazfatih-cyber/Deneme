"""Adım çalıştırma ve özet: tarif betiklerindeki her adım (komut ya da Python işlevi) burada kaydedilir.

    gunluk = Gunluk("belgeye-soru-uygulamasi · doğrulama")
    gunluk.calistir("uygulama: npm run check", ["npm", "run", "check"], hedef / "uygulama")
    with gunluk.adim("uçtan uca: soru sor"):
        ...                                   # hata fırlatırsa adım KALDI sayılır, iş durur
    gunluk.atla("caddy validate", "caddy kurulu değil (denenmedi)")
    return gunluk.bitir()                      # özet tablo + çıkış kodu (0 = hepsi geçti)

Durumlar: GEÇTİ, KALDI, DENENMEDİ (araç yok ya da ortamda yapılamıyor; nedeniyle yazılır).
`TARIF_JSON` ortam değişkeni bir dosya yolu verirse özet oraya JSON olarak da yazılır (tarif.py okur).
Genişletme: yeni bir durum gerekiyorsa `DURUMLAR`'a ekleyin ve `bitir`'de nasıl sayılacağını yazın.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

DURUMLAR = ("gecti", "kaldi", "denenmedi")
_ETIKET = {"gecti": "GEÇTİ    ", "kaldi": "KALDI    ", "denenmedi": "DENENMEDİ"}


class AdimHatasi(Exception):
    """Bir adım başarısız oldu; betik burada durur (ayrıntı yukarıdaki çıktıda)."""


@dataclass
class Adim:
    ad: str
    durum: str
    sure_sn: float
    not_: str = ""


class Gunluk:
    """Adımları sırayla kaydeder; ilk başarısız adımda `AdimHatasi` fırlatır."""

    def __init__(self, baslik: str) -> None:
        self.baslik = baslik
        self.adimlar: list[Adim] = []
        self._baslangic = time.monotonic()
        print(f"\n{'=' * 78}\n{baslik}\n{'=' * 78}", flush=True)

    def calistir(
        self,
        ad: str,
        komut: Sequence[str],
        klasor: Path,
        ortam: Mapping[str, str] | None = None,
        zaman_asimi_sn: float | None = None,
    ) -> None:
        """Komutu `klasor`de çalıştırır (çıktı ekrana akar); sıfırdan farklı çıkışta durur."""
        print(f"\n$ {' '.join(komut)}    [{klasor}]", flush=True)
        baslangic = time.monotonic()
        try:
            kod = subprocess.run(
                list(komut),
                cwd=klasor,
                env=dict(ortam) if ortam is not None else None,
                check=False,
                timeout=zaman_asimi_sn,
            ).returncode
            not_ = "" if kod == 0 else f"çıkış kodu {kod}"
        except FileNotFoundError:
            kod, not_ = 127, f"komut bulunamadı: {komut[0]}"
        except subprocess.TimeoutExpired:
            kod, not_ = 124, f"zaman aşımı ({zaman_asimi_sn:.0f} sn)"
        self._kaydet(ad, kod == 0, time.monotonic() - baslangic, not_)

    @contextmanager
    def adim(self, ad: str) -> Iterator[None]:
        """Python ile yazılmış bir adım. İçeride fırlatılan her hata adımı KALDI yapar."""
        print(f"\n--- {ad}", flush=True)
        baslangic = time.monotonic()
        try:
            yield
        except AdimHatasi:
            raise
        except Exception as hata:
            print(f"HATA: {hata}", file=sys.stderr, flush=True)
            self._kaydet(ad, False, time.monotonic() - baslangic, str(hata)[:300])
        else:
            self._kaydet(ad, True, time.monotonic() - baslangic, "")

    def atla(self, ad: str, neden: str) -> None:
        """Bu ortamda yapılamayan adımı DENENMEDİ olarak kaydeder (iş durmaz)."""
        print(f"\n--- {ad}: DENENMEDİ ({neden})", flush=True)
        self.adimlar.append(Adim(ad, "denenmedi", 0.0, neden))

    def _kaydet(self, ad: str, gecti: bool, sure: float, not_: str) -> None:
        self.adimlar.append(Adim(ad, "gecti" if gecti else "kaldi", sure, not_))
        if not gecti:
            raise AdimHatasi(f"{ad}: {not_ or 'başarısız'}")

    def bitir(self, hata: AdimHatasi | None = None) -> int:
        """Özet tabloyu basar, istenirse JSON yazar; çıkış kodunu döndürür."""
        toplam = time.monotonic() - self._baslangic
        print(f"\n{'=' * 78}\nÖZET — {self.baslik}\n{'=' * 78}")
        for adim in self.adimlar:
            ek = f"  ({adim.not_})" if adim.not_ else ""
            print(f"  {_ETIKET[adim.durum]} {adim.ad:<52} {adim.sure_sn:7.1f} sn{ek}")
        basarili = hata is None and all(a.durum != "kaldi" for a in self.adimlar)
        print(f"\nToplam {toplam:.0f} sn. " + ("Hepsi geçti." if basarili else "BAŞARISIZ."))
        if hata is not None:
            print(f"Duran adım: {hata}. Ayrıntı yukarıdaki çıktıda.", file=sys.stderr)
        hedef = os.environ.get("TARIF_JSON")
        if hedef:
            veri = {
                "baslik": self.baslik,
                "basarili": basarili,
                "sure_sn": round(toplam, 1),
                "adimlar": [asdict(adim) for adim in self.adimlar],
            }
            Path(hedef).write_text(json.dumps(veri, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if basarili else 1


def calistir_ve_ozetle(gunluk: Gunluk, isler: Sequence[Callable[[], object]]) -> int:
    """Tarif betiklerinin `main`'i için kalıp: işleri sırayla çağırır, ilk hatada özetle durur.

    `isler`: argümansız çağrılabilirler (ör. `lambda: kur(hedef)`); her biri `gunluk`a adım yazar.
    """
    try:
        for is_ in isler:
            is_()
    except AdimHatasi as hata:
        return gunluk.bitir(hata)
    return gunluk.bitir()
