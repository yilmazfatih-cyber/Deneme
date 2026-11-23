"""Sunucu durumu: ayarlar, motor önbelleği (model başına bir kez yüklenir) ve iş sınırlayıcı.

İş sınırı: aynı anda en çok `es_zamanli_is` yazıya çevirme/seslendirme çalışır (CPU'yu tek iş
doyurur); `bekleyen_is`'ten fazla istek sırada bekliyorsa yeni istek hemen 503 alır (Retry-After).
Böylece kalabalıkta bellek ve yanıt süresi sınırsız büyümez.
Kim kullanır: sunucu/uygulama.py. Genişletme: testte gerçek model yerine `stt_fabrikasi` /
`tts_fabrikasi` ile sahte motor verin (tests/test_sunucu.py).
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager

from ses.ayar import Ayarlar
from ses.hatalar import MesgulHatasi
from ses.katalog import indirilmis_mi, katalogu_oku, model_klasoru
from ses.stt.motor import SttMotoru
from ses.tts.motor import TtsMotoru

SttFabrikasi = Callable[[str], SttMotoru]
TtsFabrikasi = Callable[[str], TtsMotoru]


class IsSiniri:
    """Eş zamanlı iş sayısını ve bekleyen kuyruğu sınırlar (çalışan + bekleyen ≤ es_zamanli + bekleyen)."""

    def __init__(self, es_zamanli: int, bekleyen: int, bekleme_sn: float = 600.0) -> None:
        self._semafor = threading.BoundedSemaphore(es_zamanli)
        self._kilit = threading.Lock()
        self._icerde = 0
        self._azami = es_zamanli + bekleyen
        self._bekleme_sn = bekleme_sn

    @contextmanager
    def al(self) -> Iterator[None]:
        with self._kilit:
            if self._icerde >= self._azami:
                raise MesgulHatasi("Sunucu meşgul; birkaç saniye sonra yeniden deneyin.")
            self._icerde += 1
        try:
            if not self._semafor.acquire(timeout=self._bekleme_sn):
                raise MesgulHatasi("Sunucu meşgul; sıra beklerken süre doldu.")
            try:
                yield
            finally:
                self._semafor.release()
        finally:
            with self._kilit:
                self._icerde -= 1


def _varsayilan_stt(ayarlar: Ayarlar) -> SttFabrikasi:
    def kur(ad: str) -> SttMotoru:
        from ses.stt.whisper import WhisperMotoru

        model = katalogu_oku().bul(ad, "stt")
        return WhisperMotoru(
            model_klasoru(ayarlar.model_dizini, model), ad=ad, is_parcacigi=ayarlar.is_parcacigi
        )

    return kur


def _varsayilan_tts(ayarlar: Ayarlar) -> TtsFabrikasi:
    def kur(ad: str) -> TtsMotoru:
        from ses.tts.piper_motoru import PiperMotoru

        model = katalogu_oku().bul(ad, "tts")
        klasor = model_klasoru(ayarlar.model_dizini, model)
        return PiperMotoru(klasor / f"{ad}.onnx", ad=ad, is_parcacigi=ayarlar.is_parcacigi)

    return kur


class SunucuDurumu:
    def __init__(
        self,
        ayarlar: Ayarlar,
        *,
        stt_fabrikasi: SttFabrikasi | None = None,
        tts_fabrikasi: TtsFabrikasi | None = None,
    ) -> None:
        self.ayarlar = ayarlar
        self._stt_kur = stt_fabrikasi or _varsayilan_stt(ayarlar)
        self._tts_kur = tts_fabrikasi or _varsayilan_tts(ayarlar)
        self._stt: dict[str, SttMotoru] = {}
        self._tts: dict[str, TtsMotoru] = {}
        self._kilit = threading.Lock()
        self.is_siniri = IsSiniri(ayarlar.es_zamanli_is, ayarlar.bekleyen_is)

    def stt(self, ad: str | None) -> SttMotoru:
        ad = ad or self.ayarlar.stt_modeli
        with self._kilit:
            if ad not in self._stt:
                self._stt[ad] = self._stt_kur(ad)
            return self._stt[ad]

    def tts(self, ad: str | None) -> TtsMotoru:
        ad = ad or self.ayarlar.tts_sesi
        with self._kilit:
            if ad not in self._tts:
                self._tts[ad] = self._tts_kur(ad)
            return self._tts[ad]

    def modeller(self) -> list[tuple[str, str]]:
        """İndirilmiş (tür, ad) listesi; katalog okunamazsa boş."""
        try:
            katalog = katalogu_oku()
        except Exception:
            return []
        return [
            (m.tur, m.ad) for m in katalog.modeller if indirilmis_mi(self.ayarlar.model_dizini, m)
        ]
