"""Piper bağdaştırıcısı (piper-tts 1.8, ONNX + espeak-ng): `TtsMotoru` uyumlu.

Model ve yapılandırması YALNIZ yerel dosyadan yüklenir (`<ad>.onnx` + `<ad>.onnx.json`); indirme
`python -m ses indir --tts <ses>` ile ayrıdır. ONNX oturumu kendimiz kurarız ki iş parçacığı sayısı
sınırlansın (paylaşımlı makine; varsayılan 2). `normalize_audio=False`: Piper her cümleyi ayrı ayrı
tepeye büyütmesin — düzeyi seslendirici.py tüm metin için LUFS ile ayarlar.
LİSANS: piper-tts GPL-3.0-or-later'dır; Türkçe ses tr_TR-dfki-medium CC BY-NC-SA 4.0'dır (ticari
kullanıma kapalı). Ayrıntı: docs/LISANSLAR.md. Kim kullanır: komutlar.py (`tts_motoru_kur`), sunucu/.
Genişletme: yeni bir SynthesisConfig alanı → `cumleler`'e parametre + tests/test_tts.py imza testi.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np

from ses.hatalar import BicimHatasi, ModelBulunamadiHatasi, eksik_paket
from ses.ses_isleme.ses import Dizi

SYNTHESIS_ALANLARI = ("speaker_id", "length_scale", "noise_scale", "noise_w_scale",
                      "normalize_audio", "volume")  # fmt: skip  — tests/test_tts.py denetler


class PiperMotoru:
    """Piper sesi; model ilk sentezde yüklenir."""

    def __init__(self, model_yolu: Path, *, ad: str | None = None, is_parcacigi: int = 2) -> None:
        self.model_yolu = Path(model_yolu)
        self.yapilandirma_yolu = Path(f"{self.model_yolu}.json")
        if not self.model_yolu.is_file() or not self.yapilandirma_yolu.is_file():
            raise ModelBulunamadiHatasi(
                f"Piper sesi bulunamadı: {self.model_yolu}(.json). İndirin: python -m ses indir --tts <ses>"
            )
        try:
            self.yapilandirma: dict[str, Any] = json.loads(self.yapilandirma_yolu.read_text("utf-8"))
            self._ornekleme = int(self.yapilandirma["audio"]["sample_rate"])
        except (ValueError, KeyError, TypeError) as hata:
            raise BicimHatasi(f"Ses yapılandırması okunamadı: {self.yapilandirma_yolu}") from hata
        self._ad = ad or self.model_yolu.stem
        self.is_parcacigi = is_parcacigi
        self._ses: Any = None
        self._kilit = threading.Lock()

    @property
    def ad(self) -> str:
        return self._ad

    @property
    def ornekleme(self) -> int:
        return self._ornekleme

    def _yukle(self) -> Any:
        if self._ses is None:
            try:
                import onnxruntime
                from piper import PiperConfig, PiperVoice
            except ImportError as hata:
                raise eksik_paket("piper-tts", "tts") from hata
            secenek = onnxruntime.SessionOptions()
            secenek.intra_op_num_threads = self.is_parcacigi
            secenek.inter_op_num_threads = 1
            oturum = onnxruntime.InferenceSession(
                str(self.model_yolu), sess_options=secenek, providers=["CPUExecutionProvider"]
            )
            self._ses = PiperVoice(config=PiperConfig.from_dict(self.yapilandirma), session=oturum)
        return self._ses

    def cumleler(
        self, metin: str, *, uzunluk_olcegi: float = 1.0, konusmaci: int | None = None
    ) -> Iterator[Dizi]:
        from piper import SynthesisConfig

        with self._kilit:
            ses = self._yukle()
            ayar = SynthesisConfig(
                speaker_id=konusmaci,
                length_scale=ses.config.length_scale * uzunluk_olcegi,
                normalize_audio=False,
                volume=1.0,
            )
            parcalar = [np.asarray(p.audio_float_array, dtype=np.float32) for p in ses.synthesize(metin, ayar)]
        yield from parcalar
