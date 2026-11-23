"""faster-whisper bağdaştırıcısı: CTranslate2 Whisper modeli, CPU'da int8, Türkçe dil zorlaması.

Model YALNIZ yerel klasörden yüklenir (`local_files_only`): çalışırken ağa çıkılmaz; indirme
`python -m ses indir` ile ayrı ve sağlama özetiyle yapılır. Ayarlar: `cpu_threads` (paylaşımlı
makinede 2), `beam_size` 5, `condition_on_previous_text=False` (önceki pencerenin hatası sonrakine
taşınmasın; parçaları zaten uzun.py böler), VAD kapalı (sessizliği uzun.py kendi VAD'ıyla atlar).
Model çağrıları bir kilitle sıraya girer (aynı modeli iki iş parçacığı aynı anda çalıştırmasın).
Kim kullanır: komutlar.py (`stt_motoru_kur`), sunucu/. Genişletme: yeni bir transcribe seçeneği →
`yaziya` parametresi + tests/test_stt.py'deki imza testi (kurulu sürümün API'siyle uyuşmalı).
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from ses.hatalar import ModelBulunamadiHatasi, eksik_paket
from ses.ses_isleme.ses import Dizi
from ses.stt.motor import ORNEKLEME
from ses.stt.tipler import Bolut, Kelime, Transkript

TRANSCRIBE_SECENEKLERI = (
    "language", "task", "beam_size", "word_timestamps", "vad_filter",
    "condition_on_previous_text", "initial_prompt", "temperature",
)  # fmt: skip  — tests/test_stt.py bu adların kurulu faster-whisper'da olduğunu denetler


class WhisperMotoru:
    """`SttMotoru` uyumlu faster-whisper motoru. Model ilk çağrıda yüklenir."""

    def __init__(
        self,
        model_klasoru: Path,
        *,
        ad: str = "whisper",
        is_parcacigi: int = 2,
        hesap_turu: str = "int8",
        isin_boyu: int = 5,
    ) -> None:
        if not (Path(model_klasoru) / "model.bin").is_file():
            raise ModelBulunamadiHatasi(
                f"Whisper modeli bulunamadı: {model_klasoru}. İndirin: python -m ses indir --stt <boyut>"
            )
        self.model_klasoru = Path(model_klasoru)
        self._ad = ad
        self.is_parcacigi = is_parcacigi
        self.hesap_turu = hesap_turu
        self.isin_boyu = isin_boyu
        self._model: Any = None
        self._kilit = threading.Lock()

    @property
    def ad(self) -> str:
        return self._ad

    def _yukle(self) -> Any:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as hata:
                raise eksik_paket("faster-whisper", "stt") from hata
            self._model = WhisperModel(
                str(self.model_klasoru),
                device="cpu",
                compute_type=self.hesap_turu,
                cpu_threads=self.is_parcacigi,
                num_workers=1,
                local_files_only=True,
            )
        return self._model

    def yaziya(
        self,
        ornekler: Dizi,
        *,
        dil: str = "tr",
        kelime_zamanlari: bool = True,
        ipucu: str | None = None,
    ) -> Transkript:
        with self._kilit:
            model = self._yukle()
            bolutler_ham, bilgi = model.transcribe(
                ornekler,
                language=dil,
                task="transcribe",
                beam_size=self.isin_boyu,
                word_timestamps=kelime_zamanlari,
                vad_filter=False,
                condition_on_previous_text=False,
                initial_prompt=ipucu,
                temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            )
            bolutler = [_bolut_cevir(b) for b in bolutler_ham]  # üreteç: asıl iş burada yapılır
        return Transkript(
            dil=str(bilgi.language), sure=len(ornekler) / ORNEKLEME, model=self.ad, bolutler=bolutler
        )


def _bolut_cevir(ham: Any) -> Bolut:
    kelimeler = [
        Kelime(
            baslangic=max(0.0, float(k.start)),
            bitis=max(0.0, float(k.end)),
            metin=str(k.word),
            olasilik=float(k.probability),
        )
        for k in (ham.words or [])
    ]
    return Bolut(
        kimlik=int(ham.id),
        baslangic=max(0.0, float(ham.start)),
        bitis=max(0.0, float(ham.end)),
        metin=str(ham.text),
        kelimeler=kelimeler,
        ort_logolasilik=float(ham.avg_logprob),
        konusma_yok_olasiligi=float(ham.no_speech_prob),
    )
