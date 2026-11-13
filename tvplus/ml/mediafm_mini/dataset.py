"""Diziler, başlığa göre bölme, maskeleme ve toplu yığınlama (collate) — saf, ağsız, sınanabilir parçalar.

Bir örnek = bir yaprağın (film / bölüm) çekim dizisi: çekim başına üç kipin vektörü + "var mı" maskesi, ve başlığın
genel bağlamı (özet vektörü + etiket öznitelik vektörü).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import torch

MODS = ("visual", "audio", "text")
N_MODS = len(MODS)


@dataclass
class Sequence:
    video_id: int
    title_id: int
    feats: np.ndarray  # (n, 3, D) — kip sırası MODS
    ok: np.ndarray  # (n, 3) bool — kip var mı
    synopsis: np.ndarray  # (D,) — özet vektörü (yoksa sıfır ve synopsis_ok=False)
    synopsis_ok: bool
    tags: np.ndarray  # (T,)
    meta: dict = field(default_factory=dict)

    @property
    def n(self) -> int:
        return int(self.feats.shape[0])


def make_sequence(video_id: int, title_id: int, mods: dict[str, tuple[np.ndarray, np.ndarray]],
                  synopsis: np.ndarray | None, tags: np.ndarray, meta: dict | None = None) -> Sequence:
    feats = np.stack([mods[m][0] for m in MODS], axis=1).astype(np.float32)
    ok = np.stack([mods[m][1] for m in MODS], axis=1).astype(bool)
    feats[~ok] = 0.0  # eksik kip veri gibi davranmasın: değeri hiçbir yerde kullanılmaz, maske belirleyicidir
    d = feats.shape[2]
    syn_ok = synopsis is not None
    return Sequence(video_id, title_id, feats, ok, (synopsis if syn_ok else np.zeros(d)).astype(np.float32),
                    syn_ok, tags.astype(np.float32), meta or {})


# ───────────── Bölme ─────────────

def title_folds(title_ids: list[int], k: int, seed: int) -> list[list[int]]:
    """Başlıkları k kata böler (aynı başlığın tüm yaprakları aynı katta kalır)."""
    ids = sorted(set(title_ids))
    rng = np.random.default_rng(seed)
    rng.shuffle(ids)
    return [sorted(ids[i::k]) for i in range(k)]


def split_by_title(seqs: list[Sequence], test: set[int], val: set[int]) -> tuple[list[Sequence], ...]:
    tr = [s for s in seqs if s.title_id not in test and s.title_id not in val]
    va = [s for s in seqs if s.title_id in val]
    te = [s for s in seqs if s.title_id in test]
    assert not ({s.title_id for s in tr} & ({s.title_id for s in va} | {s.title_id for s in te}))
    return tr, va, te


# ───────────── Kırpma ve maskeleme ─────────────

def crop(n: int, length: int, rng: np.random.Generator) -> tuple[int, int]:
    """Rastgele bitişik pencere [a, b); dizi kısaysa tamamı."""
    if n <= length:
        return 0, n
    a = int(rng.integers(0, n - length + 1))
    return a, a + length


def shot_mask(n: int, ratio: float, rng: np.random.Generator, eligible: np.ndarray | None = None) -> np.ndarray:
    """Gizlenecek çekimler (en az 1, en çok n-1: bağlam hiç kalmazsa tahmin anlamsız). `eligible`: hedefi olan çekimler."""
    out = np.zeros(n, bool)
    if n < 2:
        return out
    cand = np.arange(n) if eligible is None else np.nonzero(eligible)[0]
    if len(cand) == 0:
        return out
    k = int(round(ratio * n))
    k = min(max(k, 1), n - 1, len(cand))
    out[rng.choice(cand, size=k, replace=False)] = True
    return out


def modality_mask(ok: np.ndarray, shot_hidden: np.ndarray, p: float, rng: np.random.Generator) -> np.ndarray:
    """Gizlenmemiş çekimlerde, birden çok kipi olanlardan p olasılıkla TEK bir var olan kipi gizler. (n, 3) bool."""
    n = ok.shape[0]
    out = np.zeros_like(ok)
    for i in range(n):
        if shot_hidden[i]:
            continue
        present = np.nonzero(ok[i])[0]
        if len(present) >= 2 and rng.random() < p:
            out[i, rng.choice(present)] = True
    return out


@dataclass
class Batch:
    feats: torch.Tensor  # (B, L, 3, D)
    ok: torch.Tensor  # (B, L, 3) bool
    pad: torch.Tensor  # (B, L) bool — True = dolgu
    hide_shot: torch.Tensor  # (B, L) bool
    hide_mod: torch.Tensor  # (B, L, 3) bool
    synopsis: torch.Tensor  # (B, D)
    synopsis_ok: torch.Tensor  # (B,) bool
    tags: torch.Tensor  # (B, T)


def collate(items: list[tuple[Sequence, int, int, np.ndarray, np.ndarray]]) -> Batch:
    """(dizi, a, b, çekim maskesi, kip maskesi) listesini sağa dolgulu tensörlere çevirir."""
    lens = [b - a for _, a, b, _, _ in items]
    L = max(lens)
    B = len(items)
    D = items[0][0].feats.shape[2]
    T = items[0][0].tags.shape[0]
    feats = torch.zeros(B, L, N_MODS, D)
    ok = torch.zeros(B, L, N_MODS, dtype=torch.bool)
    pad = torch.ones(B, L, dtype=torch.bool)
    hs = torch.zeros(B, L, dtype=torch.bool)
    hm = torch.zeros(B, L, N_MODS, dtype=torch.bool)
    syn = torch.zeros(B, D)
    syn_ok = torch.zeros(B, dtype=torch.bool)
    tags = torch.zeros(B, T)
    for j, (s, a, b, m_shot, m_mod) in enumerate(items):
        n = b - a
        feats[j, :n] = torch.from_numpy(s.feats[a:b])
        ok[j, :n] = torch.from_numpy(s.ok[a:b])
        pad[j, :n] = False
        hs[j, :n] = torch.from_numpy(m_shot)
        hm[j, :n] = torch.from_numpy(m_mod)
        syn[j] = torch.from_numpy(s.synopsis)
        syn_ok[j] = s.synopsis_ok
        tags[j] = torch.from_numpy(s.tags)
    return Batch(feats, ok, pad, hs, hm, syn, syn_ok, tags)
