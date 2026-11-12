"""Sıfırdan Türkçe GPT: yalnız kod çözücülü (decoder-only) Transformer.

Gömme katmanındaki her seçim ``[gomme]`` ayarlarından gelir (kullanıcının kararları). Geri kalan mimari
sabit ve yaygındır: ön-normalleştirme (pre-norm), nedensel öz-dikkat, SwiGLU ya da GELU MLP.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F

from .ayarlar import GommeAyarlari, ModelAyarlari, gommeyi_dogrula
from .tokenizer import BICIM_ADLARI, KATEGORILER


def yuvarla(n: int, kat: int = 64) -> int:
    return ((n + kat - 1) // kat) * kat


def _norm(tur: str, d: int) -> nn.Module:
    if tur == "rmsnorm":
        return nn.RMSNorm(d)
    if tur == "layernorm":
        return nn.LayerNorm(d, bias=False)
    raise ValueError(f"Bilinmeyen normalleştirme: {tur}")


def sinus_tablosu(uzunluk: int, d: int) -> torch.Tensor:
    """Sabit sinüs/kosinüs konum tablosu (Vaswani vd., 2017)."""
    konum = torch.arange(uzunluk, dtype=torch.float32)[:, None]
    bolen = torch.exp(torch.arange(0, d, 2, dtype=torch.float32) * (-math.log(10000.0) / d))
    tablo = torch.zeros(uzunluk, d)
    tablo[:, 0::2] = torch.sin(konum * bolen)
    tablo[:, 1::2] = torch.cos(konum * bolen[: d // 2])
    return tablo


def rope_tablosu(uzunluk: int, bas_boyutu: int, taban: float = 10000.0) -> tuple[torch.Tensor, torch.Tensor]:
    frek = 1.0 / (taban ** (torch.arange(0, bas_boyutu, 2, dtype=torch.float32) / bas_boyutu))
    aci = torch.outer(torch.arange(uzunluk, dtype=torch.float32), frek)
    return aci.cos(), aci.sin()


def rope_uygula(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """Döner konum kodlaması (Su vd., 2021); ardışık çiftler döndürülür. x: (B, baş, T, bas_boyutu)."""
    cos, sin = cos.to(x.dtype), sin.to(x.dtype)
    x1, x2 = x[..., 0::2], x[..., 1::2]
    return torch.stack((x1 * cos - x2 * sin, x1 * sin + x2 * cos), dim=-1).flatten(-2)


def alibi_egimleri(n: int) -> list[float]:
    """ALiBi baş eğimleri (Press vd., 2022); 2'nin kuvveti olmayan baş sayıları için makaledeki kural."""

    def kuvvet(n: int) -> list[float]:
        bas = 2 ** (-(2 ** -(math.log2(n) - 3)))
        return [bas * bas**i for i in range(n)]

    if math.log2(n).is_integer():
        return kuvvet(n)
    m = 2 ** math.floor(math.log2(n))
    return kuvvet(m) + alibi_egimleri(2 * m)[0::2][: n - m]


class Gomme(nn.Module):
    """Token kimliği → vektör. Tüm gömme kararları burada uygulanır."""

    def __init__(
        self,
        g: GommeAyarlari,
        sozluk_boyutu: int,
        baglam: int,
        kategoriler: Sequence[int] | None = None,
        analar: Sequence[int] | None = None,
        bicimler: Sequence[int] | None = None,
    ) -> None:
        super().__init__()
        self.g = g
        d = int(g.boyut)
        self.sozluk_boyutu = sozluk_boyutu
        self.V = yuvarla(sozluk_boyutu)  # GPU verimi için 64'ün katı; fazla satırlar hiç kullanılmaz
        e = int(g.faktor_boyutu) or d
        std = g.std()
        dolgu = list(range(sozluk_boyutu, self.V))

        self.bicim: nn.Embedding | None = None
        if g.bicim_paylasimi:
            if analar is None or bicimler is None:
                raise ValueError("bicim_paylasimi için tokenizer'ın ana/biçim bilgisi gerekir")
            ana = list(analar) + dolgu
            sira = {a: i for i, a in enumerate(sorted(set(ana)))}  # aynı anaya bağlı token'lar aynı satır
            self.register_buffer("satir_ids", torch.tensor([sira[a] for a in ana]), persistent=False)
            self.register_buffer("bicim_ids", torch.tensor(list(bicimler) + [0] * len(dolgu)), persistent=False)
            self.tablo = nn.Embedding(len(sira), e)
            self.bicim = nn.Embedding(len(BICIM_ADLARI), e)
            nn.init.zeros_(self.bicim.weight)  # başta biçimler tamamen ortak; fark öğrenilir
        else:
            self.tablo = nn.Embedding(self.V, e)
        nn.init.normal_(self.tablo.weight, 0.0, std)

        self.izdusum: nn.Linear | None = None
        if e != d:
            self.izdusum = nn.Linear(e, d, bias=False)
            nn.init.normal_(self.izdusum.weight, 0.0, e**-0.5)  # etkin gömme std'si ≈ baslatma_std kalır

        self.kategori: nn.Embedding | None = None
        if g.kategori_gommesi:
            if kategoriler is None:
                raise ValueError("kategori_gommesi için tokenizer'ın kategori bilgisi gerekir")
            self.register_buffer("kategori_ids", torch.tensor(list(kategoriler) + [0] * len(dolgu)), persistent=False)
            self.kategori = nn.Embedding(len(KATEGORILER), d)
            nn.init.zeros_(self.kategori.weight)

        self.konum: nn.Embedding | None = None
        if g.konum == "ogrenilen":
            self.konum = nn.Embedding(baglam, d)
            nn.init.normal_(self.konum.weight, 0.0, std)
        if g.konum == "sinus":
            self.register_buffer("sinus", sinus_tablosu(baglam, d), persistent=False)

        self.norm = _norm(g.norm, d) if g.norm != "yok" else None
        self.olcek = math.sqrt(d) if g.olcek else 1.0
        self.dropout = nn.Dropout(float(g.dropout))

    def forward(self, idx: torch.Tensor) -> torch.Tensor:
        if self.bicim is not None:
            x = self.tablo(self.satir_ids[idx]) + self.bicim(self.bicim_ids[idx])
        else:
            x = self.tablo(idx)
        if self.izdusum is not None:
            x = self.izdusum(x)
        if self.olcek != 1.0:
            x = x * self.olcek
        if self.kategori is not None:
            x = x + self.kategori(self.kategori_ids[idx])
        t = idx.shape[1]
        if self.konum is not None:
            x = x + self.konum.weight[:t]
        elif self.g.konum == "sinus":
            x = x + self.sinus[:t].to(x.dtype)
        if self.norm is not None:
            x = self.norm(x)
        return self.dropout(x)

    def bagli_cikis(self, h: torch.Tensor) -> torch.Tensor:
        """Ağırlık bağlamada çıkış: logit = h · (E·P)ᵀ = (h·P)·Eᵀ (P: izdüşüm, varsa)."""
        if self.izdusum is not None:
            h = h @ self.izdusum.weight
        return h @ self.tablo.weight.t()


class Dikkat(nn.Module):
    def __init__(self, d: int, bas_sayisi: int, bas_boyutu: int, konum: str, baglam: int, dropout: float) -> None:
        super().__init__()
        self.qkv = nn.Linear(d, 3 * d, bias=False)
        self.izdusum = nn.Linear(d, d, bias=False)
        self.bas_sayisi, self.bas_boyutu, self.konum = bas_sayisi, bas_boyutu, konum
        self.dropout = dropout
        self.artik_dropout = nn.Dropout(dropout)
        if konum == "rope":
            cos, sin = rope_tablosu(baglam, bas_boyutu)
            self.register_buffer("rope_cos", cos, persistent=False)
            self.register_buffer("rope_sin", sin, persistent=False)
        if konum == "alibi":
            self.register_buffer("alibi_egim", torch.tensor(alibi_egimleri(bas_sayisi)), persistent=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, t, c = x.shape
        q, k, v = self.qkv(x).split(c, dim=2)
        q, k, v = (z.view(b, t, self.bas_sayisi, self.bas_boyutu).transpose(1, 2) for z in (q, k, v))
        if self.konum == "rope":
            q = rope_uygula(q, self.rope_cos[:t], self.rope_sin[:t])
            k = rope_uygula(k, self.rope_cos[:t], self.rope_sin[:t])
        p = self.dropout if self.training else 0.0
        if self.konum == "alibi":
            sira = torch.arange(t, device=x.device)
            uzaklik = (sira[None, :] - sira[:, None]).to(torch.float32)  # j - i (geçmiş için ≤ 0)
            sapma = self.alibi_egim[:, None, None] * uzaklik[None]
            sapma = sapma.masked_fill(torch.ones(t, t, dtype=torch.bool, device=x.device).triu(1), float("-inf"))
            y = F.scaled_dot_product_attention(q, k, v, attn_mask=sapma.to(q.dtype), dropout_p=p)
        else:
            y = F.scaled_dot_product_attention(q, k, v, dropout_p=p, is_causal=True)
        y = y.transpose(1, 2).contiguous().view(b, t, c)
        return self.artik_dropout(self.izdusum(y))


class MLP(nn.Module):
    def __init__(self, d: int, tur: str, dropout: float) -> None:
        super().__init__()
        if tur == "swiglu":
            gizli = yuvarla(int(8 * d / 3))
            self.w1, self.w3 = nn.Linear(d, gizli, bias=False), nn.Linear(d, gizli, bias=False)
        elif tur == "gelu":
            gizli = 4 * d
            self.w1, self.w3 = nn.Linear(d, gizli, bias=False), None
        else:
            raise ValueError(f"Bilinmeyen MLP türü: {tur} (swiglu | gelu)")
        self.w2 = nn.Linear(gizli, d, bias=False)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.silu(self.w1(x)) * self.w3(x) if self.w3 is not None else F.gelu(self.w1(x))
        return self.dropout(self.w2(x))


class Blok(nn.Module):
    def __init__(self, g: GommeAyarlari, m: ModelAyarlari) -> None:
        super().__init__()
        d = int(g.boyut)
        self.n1 = _norm(m.norm, d)
        self.dikkat = Dikkat(d, m.bas_sayisi(d), m.bas_boyutu, g.konum, m.baglam, m.dropout)
        self.n2 = _norm(m.norm, d)
        self.mlp = MLP(d, m.mlp, m.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.dikkat(self.n1(x))
        return x + self.mlp(self.n2(x))


class TurkceGPT(nn.Module):
    def __init__(
        self,
        g: GommeAyarlari,
        m: ModelAyarlari,
        sozluk_boyutu: int,
        kategoriler: Sequence[int] | None = None,
        analar: Sequence[int] | None = None,
        bicimler: Sequence[int] | None = None,
    ) -> None:
        super().__init__()
        gommeyi_dogrula(g, m)
        self.g, self.m = g, m
        self.sozluk_boyutu = sozluk_boyutu
        d = int(g.boyut)
        self.gomme = Gomme(g, sozluk_boyutu, m.baglam, kategoriler, analar, bicimler)
        self.bloklar = nn.ModuleList(Blok(g, m) for _ in range(m.katman))
        self.son_norm = _norm(m.norm, d)
        self.cikis: nn.Linear | None = None if g.cikis_baglama else nn.Linear(d, self.gomme.V, bias=False)
        artik_std = 0.02 / math.sqrt(2 * m.katman)  # GPT-2: artık yola yazan katmanlar küçük başlar
        for ad, p in self.named_parameters():
            if ad.startswith("gomme.") or p.dim() != 2:
                continue
            artik = ad.endswith("dikkat.izdusum.weight") or ad.endswith("mlp.w2.weight")
            nn.init.normal_(p, 0.0, artik_std if artik else 0.02)

    @classmethod
    def tokenizer_ile(cls, g: GommeAyarlari, m: ModelAyarlari, tok) -> TurkceGPT:
        return cls(g, m, tok.boyut, tok.kategoriler, tok.analar, tok.bicimler)

    def forward(self, idx: torch.Tensor, hedef: torch.Tensor | None = None):
        if idx.shape[1] > self.m.baglam:
            raise ValueError(f"Dizi uzunluğu ({idx.shape[1]}) bağlamı ({self.m.baglam}) aşıyor")
        x = self.gomme(idx)
        for blok in self.bloklar:
            x = blok(x)
        x = self.son_norm(x)
        logit = self.gomme.bagli_cikis(x) if self.cikis is None else self.cikis(x)
        logit = logit[..., : self.sozluk_boyutu]  # dolgu satırları olasılık almaz
        kayip = None
        if hedef is not None:
            kayip = F.cross_entropy(logit.float().reshape(-1, logit.size(-1)), hedef.reshape(-1), ignore_index=-100)
        return logit, kayip

    @torch.no_grad()
    def uret(
        self,
        idx: torch.Tensor,
        yeni: int,
        sicaklik: float = 0.8,
        ust_k: int | None = 50,
        dur: Sequence[int] = (),
        uretec: torch.Generator | None = None,
    ) -> torch.Tensor:
        for _ in range(yeni):
            logit, _ = self(idx[:, -self.m.baglam :])
            logit = logit[:, -1, :].float()
            if sicaklik <= 0:
                sonraki = logit.argmax(dim=-1, keepdim=True)
            else:
                logit = logit / sicaklik
                if ust_k:
                    esik = torch.topk(logit, min(ust_k, logit.size(-1))).values[:, [-1]]
                    logit = logit.masked_fill(logit < esik, float("-inf"))
                olasilik = F.softmax(logit, dim=-1)
                if uretec is not None:  # tohumlu örnekleme CPU üretecinde (MPS'te üreteç desteği sürüme bağlı)
                    sonraki = torch.multinomial(olasilik.cpu(), 1, generator=uretec).to(idx.device)
                else:
                    sonraki = torch.multinomial(olasilik, 1)
            idx = torch.cat((idx, sonraki), dim=1)
            if dur and int(sonraki[0, 0]) in dur:
                break
        return idx

    def parametre_dokumu(self) -> dict[str, int]:
        def say(mod: nn.Module | None) -> int:
            return sum(p.numel() for p in mod.parameters()) if mod is not None else 0

        g = self.gomme
        dokum = {
            "gömme tablosu": g.tablo.weight.numel(),
            "izdüşüm (ayrıştırma)": say(g.izdusum),
            "biçim vektörleri": say(g.bicim),
            "kategori vektörleri": say(g.kategori),
            "konum tablosu": say(g.konum),
            "gömme normu": say(g.norm),
            "transformer katmanları": say(self.bloklar) + say(self.son_norm),
            "çıkış katmanı": say(self.cikis),
        }
        dokum["toplam"] = sum(dokum.values())
        dokum["gömme dışı"] = dokum["transformer katmanları"]
        return dokum

    def iyilestirici(self, ogrenme_orani: float, agirlik_azaltma: float, cihaz: str) -> torch.optim.Optimizer:
        """AdamW; ağırlık azaltma yalnız 2 boyutlu matrislere (gömme tabloları dahil), norm ve vektörlere değil."""
        azalan = [p for p in self.parameters() if p.requires_grad and p.dim() >= 2]
        sabit = [p for p in self.parameters() if p.requires_grad and p.dim() < 2]
        gruplar = [{"params": azalan, "weight_decay": agirlik_azaltma}, {"params": sabit, "weight_decay": 0.0}]
        ek = {"fused": True} if cihaz == "cuda" else {}
        return torch.optim.AdamW(gruplar, lr=ogrenme_orani, betas=(0.9, 0.95), eps=1e-8, **ek)
