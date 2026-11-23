"""`degerlendir` komutu: ses + doğru metin listesi (JSONL) → WER/CER/RTF raporu (JSON + Markdown).

JSONL satırı: {"ses": "kayit1.wav", "metin": "doğru metin", "kimlik": "k1", "etiket": "tarih"}
(`ses` yolu JSONL dosyasının klasörüne göredir; `kimlik` ve `etiket` isteğe bağlı). Her örnek için iki
ölçüm verilir: düz (yalnız harf/noktalama normalizasyonu) ve "sayılar yazıyla" (iki taraf da
seslendirme normalizasyonundan geçer; "23 Kasım" ile "23.11.2026" eşitlenir). Etikete göre toplu
tablo hangi tür cümlede hata yapıldığını gösterir. Kim kullanır: komutlar.py, scripts/gidis_donus.py.
Genişletme: yeni bir sütun → `OrnekSonucu` + `markdown_rapor`; tests/test_olcum.py'yi güncelleyin.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path

from pydantic import BaseModel, ValidationError

from ses.hatalar import BicimHatasi, dosya_hatasi
from ses.olcum.hata_orani import Olcum, cer_olc, topla, wer_olc
from ses.olcum.rtf import Kronometre, rtf
from ses.ses_isleme.yukle import stt_girdisi
from ses.stt.motor import ORNEKLEME, SttMotoru
from ses.stt.uzun import uzun_yaziya


class DegerlendirmeSatiri(BaseModel):
    ses: str
    metin: str
    kimlik: str | None = None
    etiket: str | None = None


class OrnekSonucu(BaseModel):
    kimlik: str
    etiket: str | None
    dogru: str
    tahmin: str
    ses_sn: float
    islem_sn: float
    wer: Olcum
    cer: Olcum
    wer_sayili: Olcum
    cer_sayili: Olcum


class Rapor(BaseModel):
    model: str
    tarih: str
    ornekler: list[OrnekSonucu]

    def toplam(self, alan: str, etiket: str | None = None) -> Olcum:
        return topla(
            getattr(o, alan) for o in self.ornekler if etiket is None or o.etiket == etiket
        )

    @property
    def rtf(self) -> float:
        return rtf(sum(o.islem_sn for o in self.ornekler), sum(o.ses_sn for o in self.ornekler))


def satirlari_oku(yol: Path) -> list[DegerlendirmeSatiri]:
    """JSONL'i okur ve doğrular; hatalı satırın numarasını söyler."""
    try:
        metin = yol.read_text(encoding="utf-8")
    except OSError as hata:
        raise dosya_hatasi(yol, hata) from hata
    satirlar = []
    for no, ham in enumerate(metin.splitlines(), start=1):
        if not ham.strip() or ham.lstrip().startswith("#"):
            continue
        try:
            satirlar.append(DegerlendirmeSatiri.model_validate(json.loads(ham)))
        except (json.JSONDecodeError, ValidationError) as hata:
            raise BicimHatasi(
                f'{yol}:{no}: satır {{"ses": "dosya.wav", "metin": "..."}} biçiminde olmalı ({hata.__class__.__name__}).'
            ) from hata
    if not satirlar:
        raise BicimHatasi(f"{yol}: hiç örnek yok.")
    return satirlar


def degerlendir(
    jsonl: Path,
    motor: SttMotoru,
    *,
    tarih: str,
    saat: Callable[[], float] = time.perf_counter,
    ilerleme: Callable[[int, int], None] | None = None,
) -> Rapor:
    """Her sesi yazıya çevirip doğru metinle karşılaştırır."""
    satirlar = satirlari_oku(jsonl)
    sonuclar: list[OrnekSonucu] = []
    for sira, satir in enumerate(satirlar, start=1):
        ornekler = stt_girdisi(jsonl.parent / satir.ses)
        with Kronometre(saat) as kronometre:
            tahmin = uzun_yaziya(motor, ornekler, kelime_zamanlari=False).metin
        sonuclar.append(
            OrnekSonucu(
                kimlik=satir.kimlik or Path(satir.ses).stem,
                etiket=satir.etiket,
                dogru=satir.metin,
                tahmin=tahmin,
                ses_sn=len(ornekler) / ORNEKLEME,
                islem_sn=kronometre.sure,
                wer=wer_olc(satir.metin, tahmin),
                cer=cer_olc(satir.metin, tahmin),
                wer_sayili=wer_olc(satir.metin, tahmin, sayilari_yaz=True),
                cer_sayili=cer_olc(satir.metin, tahmin, sayilari_yaz=True),
            )
        )
        if ilerleme is not None:
            ilerleme(sira, len(satirlar))
    return Rapor(model=motor.ad, tarih=tarih, ornekler=sonuclar)


def _yuzde(olcum: Olcum) -> str:
    return f"%{olcum.oran * 100:.1f}".replace(".", ",")


def markdown_rapor(rapor: Rapor) -> str:
    """İnsan için Türkçe rapor (tablolar)."""
    ses_sn = sum(o.ses_sn for o in rapor.ornekler)
    islem_sn = sum(o.islem_sn for o in rapor.ornekler)
    satirlar = [
        f"# Değerlendirme raporu — {rapor.model}", "", f"Tarih: {rapor.tarih} · Örnek: {len(rapor.ornekler)}",
        f"· Ses: {ses_sn:.1f} sn · İşlem: {islem_sn:.1f} sn · RTF: {rapor.rtf:.3f}".replace(".", ","), "",
        "| Ölçüt | Düz | Sayılar yazıyla |", "| --- | ---: | ---: |",
        f"| WER | {_yuzde(rapor.toplam('wer'))} | {_yuzde(rapor.toplam('wer_sayili'))} |",
        f"| CER | {_yuzde(rapor.toplam('cer'))} | {_yuzde(rapor.toplam('cer_sayili'))} |", "",
    ]  # fmt: skip
    etiketler = sorted({o.etiket for o in rapor.ornekler if o.etiket})
    if etiketler:
        satirlar += ["## Türe göre", "", "| Tür | Örnek | WER | CER | WER (sayılar yazıyla) | CER (sayılar yazıyla) |",
                     "| --- | ---: | ---: | ---: | ---: | ---: |"]  # fmt: skip
        for etiket in etiketler:
            adet = sum(1 for o in rapor.ornekler if o.etiket == etiket)
            olc = [
                _yuzde(rapor.toplam(a, etiket)) for a in ("wer", "cer", "wer_sayili", "cer_sayili")
            ]
            satirlar.append(f"| {etiket} | {adet} | " + " | ".join(olc) + " |")
        satirlar.append("")
    satirlar += ["## Örnekler", "", "| Kimlik | WER | CER (sayılar yazıyla) | Doğru | Tahmin |",
                 "| --- | ---: | ---: | --- | --- |"]  # fmt: skip
    for o in rapor.ornekler:
        dogru, tahmin = (m.replace("|", "\\|") for m in (o.dogru, o.tahmin))
        satirlar.append(
            f"| {o.kimlik} | {_yuzde(o.wer)} | {_yuzde(o.cer_sayili)} | {dogru} | {tahmin} |"
        )
    return "\n".join(satirlar) + "\n"


def rapor_yaz(rapor: Rapor, klasor: Path) -> tuple[Path, Path]:
    """`rapor.json` ve `rapor.md` yazar; yollarını döndürür."""
    klasor.mkdir(parents=True, exist_ok=True)
    json_yolu, md_yolu = klasor / "rapor.json", klasor / "rapor.md"
    json_yolu.write_text(rapor.model_dump_json(indent=2) + "\n", encoding="utf-8")
    md_yolu.write_text(markdown_rapor(rapor), encoding="utf-8")
    return json_yolu, md_yolu
