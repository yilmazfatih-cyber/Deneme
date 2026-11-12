"""Eğitilmiş modelle oynamak: serbest metin, sözlük tanımı, soru çözme."""

from __future__ import annotations

import contextlib

import torch

from .tokenizer import EOS, TurkceTokenizer


def metin_uret(
    model,
    tok: TurkceTokenizer,
    istem: str,
    uzunluk: int = 120,
    sicaklik: float = 0.8,
    ust_k: int | None = 50,
    cihaz: str = "cpu",
    tohum: int | None = None,
) -> str:
    ids = tok.encode(istem, bos=True)
    uretec = torch.Generator().manual_seed(tohum) if tohum is not None else None
    x = torch.tensor([ids], dtype=torch.long, device=cihaz)
    model.eval()
    y = model.uret(x, uzunluk, sicaklik=sicaklik, ust_k=ust_k, dur=(EOS,), uretec=uretec)
    return tok.decode(y[0, len(ids) :].tolist())


def tanimla(model, tok: TurkceTokenizer, kelime: str, **kw) -> str:
    """TDK derlemindeki madde biçimini taklit eder: ilk satır kelime, sonraki satırlar anlamlar."""
    return metin_uret(model, tok, kelime.strip() + "\n", **kw)


def soru_cevapla(model, tok: TurkceTokenizer, soru, cihaz: str = "cpu", ctx=contextlib.nullcontext) -> list[tuple[str, float]]:
    """Her şıkkın olasılığı (seçenek metni puanlarından softmax)."""
    from .degerlendirme import secenek_puanlari
    from .meb import HARFLER

    puan = secenek_puanlari(model, tok, soru, cihaz, ctx)["metin"]
    olasilik = torch.softmax(torch.tensor(puan), dim=0).tolist()
    return [(HARFLER[i], p) for i, p in enumerate(olasilik)]
