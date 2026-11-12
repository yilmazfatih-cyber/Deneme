"""Eğitim verisi: token akışları (``.bin``) ve soru örnekleri (``.npz``)."""

from __future__ import annotations

import hashlib
import json
import zlib
from array import array
from collections.abc import Iterable, Iterator
from pathlib import Path

import numpy as np
import torch

from .metin import normallestir
from .tokenizer import PAD, TurkceTokenizer


def token_turu(sozluk_boyutu: int) -> type:
    return np.uint16 if sozluk_boyutu <= 65535 else np.uint32


def tokenizer_imzasi(tok: TurkceTokenizer) -> str:
    """Sözlüğün parmak izi: farklı tokenizer'la hazırlanmış veri ya da modelle karıştırmayı önler."""
    return hashlib.sha256("\x1f".join(tok.parcalar).encode("utf-8")).hexdigest()[:16]


def tokenizer_gomme_imzasi(tok: TurkceTokenizer) -> str:
    """Parçalar + kategori/ana/biçim bağlarının parmak izi. Biçim paylaşımı ve kategori gömmesi bu bağlardan
    yüklenirken yeniden kurulur; parçalar aynı kalıp bağlar değişirse model sessizce farklı çalışırdı."""
    veri = json.dumps([tok.parcalar, tok.kategoriler, tok.analar, tok.bicimler], ensure_ascii=False)
    return hashlib.sha256(veri.encode("utf-8")).hexdigest()[:16]


class AkisYazici:
    """Belgeleri ``<bos> … <eos>`` ile kodlayıp diske parça parça yazar (bellek dostu)."""

    def __init__(self, yol: Path, tok: TurkceTokenizer, tampon: int = 1 << 20) -> None:
        self.yol, self.tok = yol, tok
        self.kod = "H" if token_turu(tok.boyut) is np.uint16 else "I"
        self.tampon_boyutu = tampon
        self.tampon = array(self.kod)
        self.token = self.karakter = self.belge = 0
        yol.parent.mkdir(parents=True, exist_ok=True)
        self._dosya = yol.open("wb")

    def ekle(self, metin: str) -> None:
        metin = normallestir(metin)
        if not metin:
            return
        ids = self.tok.encode(metin, bos=True, eos=True, normalle=False)
        self.tampon.extend(ids)
        self.token += len(ids)
        self.karakter += len(metin)
        self.belge += 1
        if len(self.tampon) >= self.tampon_boyutu:
            self._bosalt()

    def _bosalt(self) -> None:
        np.frombuffer(self.tampon, dtype=token_turu(self.tok.boyut)).tofile(self._dosya)
        self.tampon = array(self.kod)

    def kapat(self) -> dict:
        self._bosalt()
        self._dosya.close()
        return {"token": self.token, "karakter": self.karakter, "belge": self.belge}


def ek_metin_belgeleri(klasor: Path) -> Iterator[tuple[str, str]]:
    """``veri/ek_metin/**/*.txt`` dosyalarını boş satırla ayrılmış paragraflara böler: ``(anahtar, paragraf)``."""
    for yol in sorted(klasor.rglob("*.txt")):
        metin = yol.read_text(encoding="utf-8", errors="replace")
        for i, paragraf in enumerate(p for p in metin.split("\n\n") if p.strip()):
            yield f"{yol.relative_to(klasor)}:{i}", paragraf


def dogrulamaya_mi(anahtar: str, yuzde: float = 1.0) -> bool:
    return (zlib.crc32(anahtar.encode("utf-8")) % 10000) < yuzde * 100


class AkisVeri:
    """Diskteki token akışından rastgele pencereler (nanoGPT gibi)."""

    def __init__(self, yol: Path, sozluk_boyutu: int) -> None:
        self.yol = yol
        self.veri = np.memmap(yol, dtype=token_turu(sozluk_boyutu), mode="r")

    def __len__(self) -> int:
        return len(self.veri)

    def yigin(self, b: int, t: int, uretec: np.random.Generator) -> tuple[torch.Tensor, torch.Tensor]:
        if len(self.veri) < t + 2:
            raise ValueError(f"{self.yol.name} çok kısa ({len(self.veri)} token): bağlamı ({t}) küçült ya da veri ekle")
        ix = uretec.integers(0, len(self.veri) - t - 1, size=b)
        x = np.stack([self.veri[i : i + t] for i in ix]).astype(np.int64)
        y = np.stack([self.veri[i + 1 : i + 1 + t] for i in ix]).astype(np.int64)
        return torch.from_numpy(x), torch.from_numpy(y)

    def pencereler(self, t: int, b: int, en_fazla: int | None = None) -> Iterator[tuple[torch.Tensor, torch.Tensor]]:
        """Akışı baştan sona örtüşmeyen pencerelerle tarar (tam değerlendirme için)."""
        n = len(self.veri) - 1
        baslar = list(range(0, max(n - t, 0) + 1, t)) or [0]
        if en_fazla is not None:
            baslar = baslar[:en_fazla]
        for k in range(0, len(baslar), b):
            grup = baslar[k : k + b]
            uz = min(t, n)
            x = np.stack([self.veri[i : i + uz] for i in grup]).astype(np.int64)
            y = np.stack([self.veri[i + 1 : i + 1 + uz] for i in grup]).astype(np.int64)
            yield torch.from_numpy(x), torch.from_numpy(y)


def sorulari_kodla(tok: TurkceTokenizer, sorular: Iterable, hedef: Path) -> dict:
    """Soruları ``<bos> istem cevap <eos>`` olarak kodlar; cevabın başladığı konumu saklar."""
    from .meb import istem, soru_metni

    ids: list[int] = []
    baslar = [0]
    cevaplar: list[int] = []
    for s in sorular:
        tam = tok.encode(soru_metni(s), bos=True, eos=True)
        on = tok.encode(istem(s), bos=True)
        ortak = 0
        while ortak < min(len(on), len(tam)) and on[ortak] == tam[ortak]:
            ortak += 1
        ids.extend(tam)
        baslar.append(len(ids))
        cevaplar.append(ortak)
    hedef.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        hedef,
        ids=np.array(ids, dtype=np.int64),
        baslar=np.array(baslar, dtype=np.int64),
        cevaplar=np.array(cevaplar, dtype=np.int64),
    )
    return {"soru": len(cevaplar), "token": len(ids)}


class SoruVeri:
    """Kodlanmış sorulardan sağdan dolgulu yığınlar; istenirse kayıp yalnız cevap token'larında."""

    def __init__(self, yol: Path) -> None:
        d = np.load(yol)
        self.ids, self.baslar, self.cevaplar = d["ids"], d["baslar"], d["cevaplar"]

    def __len__(self) -> int:
        return len(self.cevaplar)

    def token_sayisi(self) -> int:
        return int(len(self.ids))

    def ornek(self, i: int, t: int, kayip: str = "tum") -> tuple[np.ndarray, np.ndarray]:
        dizi = self.ids[self.baslar[i] : self.baslar[i + 1]]
        cevap = int(self.cevaplar[i])
        if len(dizi) > t + 1:  # çok uzun soru: baştan kes, cevap kalsın
            kesilen = len(dizi) - (t + 1)
            dizi = dizi[kesilen:]
            cevap = max(cevap - kesilen, 1)
        x = dizi[:-1].copy()
        y = dizi[1:].copy()
        if kayip == "cevap":
            y[: max(cevap - 1, 0)] = -100  # cevabın ilk token'ı, cevap-1 konumunda tahmin edilir
        return x, y

    def yigin(
        self, b: int, t: int, uretec: np.random.Generator, kayip: str = "tum", secim: np.ndarray | None = None
    ) -> tuple[torch.Tensor, torch.Tensor]:
        secilen = secim if secim is not None else uretec.integers(0, len(self), size=b)
        uzun = max(1, min(t, max(int(self.baslar[i + 1] - self.baslar[i]) - 1 for i in secilen)))
        x = np.full((len(secilen), uzun), PAD, dtype=np.int64)
        y = np.full((len(secilen), uzun), -100, dtype=np.int64)
        for r, i in enumerate(secilen):
            xi, yi = self.ornek(int(i), t, kayip)
            x[r, : len(xi)] = xi
            y[r, : len(yi)] = yi
        return torch.from_numpy(x), torch.from_numpy(y)


def meta_yaz(klasor: Path, meta: dict) -> None:
    (klasor / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def meta_oku(klasor: Path) -> dict | None:
    yol = klasor / "meta.json"
    return json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else None
