"""Eğitilmiş modelle oynamak: serbest metin, sözlük tanımı, soru çözme."""

from __future__ import annotations

import contextlib
import math
from collections.abc import Sequence

import torch

from .tokenizer import EOS, SATIR_ID, TurkceTokenizer

# Bundan küçük sıcaklık en olası token'ı seçmekle aynıdır (0 gibi davranır): logit / sıcaklık float32'de taşıp
# (inf) olasılıkları bozmasın, örnekleme izleme dökümüyle çökmesin.
EN_KUCUK_SICAKLIK = 1e-4


def metin_uret(
    model,
    tok: TurkceTokenizer,
    istem: str,
    uzunluk: int = 120,
    sicaklik: float = 0.8,
    ust_k: int | None = 50,
    cihaz: str = "cpu",
    tohum: int | None = None,
    son_ids: Sequence[int] = (),
) -> str:
    """İstemin devamını döndürür (istemin kendisi hariç).

    İstem ve devam birlikte çözülür, sonra istemin çözümü kesilir: yalnız yeni token'ları çözmek, ilk kelimenin
    önündeki boşluğu satır başı sayıp silerdi ("Türk dili" + "▁ve" → "Türk dilive").
    ``son_ids`` istemin sonuna doğrudan eklenen token'lardır (ör. satır sonu; normalleştirme metnin sonundaki
    satır sonunu sildiği için token olarak eklenir).
    ``sicaklik`` sonlu ve eksi olmayan bir sayı olmalı (``ValueError``); çok küçüğü 0 sayılır.
    """
    if not math.isfinite(sicaklik) or sicaklik < 0:
        raise ValueError(f"sıcaklık 0 ya da daha büyük bir sayı olmalı (şu an: {sicaklik})")
    if sicaklik < EN_KUCUK_SICAKLIK:
        sicaklik = 0.0
    ids = tok.encode(istem, bos=True) + list(son_ids)
    uretec = torch.Generator().manual_seed(tohum) if tohum is not None else None
    x = torch.tensor([ids], dtype=torch.long, device=cihaz)
    model.eval()
    y = model.uret(x, uzunluk, sicaklik=sicaklik, ust_k=ust_k, dur=(EOS,), uretec=uretec)
    tam = tok.decode(y[0].tolist())
    onek = tok.decode(ids)
    if tam.startswith(onek):
        return tam[len(onek) :]
    return tok.decode(y[0, len(ids) :].tolist())


def tanimla(model, tok: TurkceTokenizer, kelime: str, **kw) -> str:
    """TDK derlemindeki madde biçimini taklit eder: ilk satır kelime, sonraki satırlar anlamlar.

    İstem ``<bos> kelime <satır sonu>`` olur; model tanımı yeni satırdan başlatır.
    """
    return metin_uret(model, tok, kelime.strip(), son_ids=(SATIR_ID,), **kw)


def soru_cevapla(model, tok: TurkceTokenizer, soru, cihaz: str = "cpu", ctx=contextlib.nullcontext) -> list[tuple[str, float]]:
    """Her şıkkın olasılığı (şık metni puanlarından softmax)."""
    from .degerlendirme import secenek_puanlari
    from .meb import HARFLER

    puan = secenek_puanlari(model, tok, soru, cihaz, ctx)["metin"]
    olasilik = torch.softmax(torch.tensor(puan), dim=0).tolist()
    return [(HARFLER[i], p) for i, p in enumerate(olasilik)]
