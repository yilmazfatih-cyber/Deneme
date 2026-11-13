"""mediafm-mini kaynaştırma dönüştürücüsü — EĞİTTİĞİMİZ tek parça (kip kodlayıcıları dondurulmuştur).

    çekim i:  görüntü 512 ─► Doğrusal ─┐  (kip yoksa / gizliyse: öğrenilmiş "kip yok" gömmesi)
              ses     512 ─► Doğrusal ─┼─► birleştir (3d) ─► Doğrusal + LayerNorm ─► x_i   (gizli çekimde x_i = [MASK])
              metin   512 ─► Doğrusal ─┘
    [GLOBAL] = Doğrusal(özet vektörü 512 | "özet yok")  +  MLP(etiket öznitelikleri)   — başlık düzeyi bağlam
    dizi:     [CLS] [GLOBAL] x_1 … x_n   + konum (sinüs; çekimler 0..n-1, özel belirteçler ayrı öğrenilmiş tür gömmesi)
    ─► Dönüştürücü kodlayıcı (pre-LN, `layers` katman) ─► h_i  = BAĞLAMSAL ÇEKİM VEKTÖRÜ (dışa aktarılan)
    ─► kip başına tahmin başlığı: h_i ─► 512 (gizlenen çekimin özgün tek kipli vektörleri; kosinüs kaybı)

Hedef — maskeli çekim modelleme: çekimlerin bir payı [MASK] ile değiştirilir ve özgün tek kipli vektörleri komşu
çekimlerden ve genel bağlamdan tahmin edilir; ayrıca bazen tek bir kip gizlenip yalnız o kip tahmin edilir.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import torch
from torch import nn
import torch.nn.functional as F

from .dataset import N_MODS, Batch


@dataclass
class ModelConfig:
    in_dim: int = 512
    tag_dim: int = 242
    d: int = 128
    layers: int = 3
    heads: int = 4
    ff: int = 256
    dropout: float = 0.2
    use_global: bool = True
    max_len: int = 64  # eğitim penceresi; daha uzun yapraklar örtüşen pencerelerle kodlanır

    def to_dict(self) -> dict:
        return asdict(self)


def sinusoid(n: int, d: int, device=None) -> torch.Tensor:
    pos = torch.arange(n, device=device, dtype=torch.float32)[:, None]
    i = torch.arange(0, d, 2, device=device, dtype=torch.float32)
    ang = pos / torch.pow(10000.0, i / d)
    pe = torch.zeros(n, d, device=device)
    pe[:, 0::2] = torch.sin(ang)
    pe[:, 1::2] = torch.cos(ang)
    return pe


class MediaFMMini(nn.Module):
    def __init__(self, cfg: ModelConfig) -> None:
        super().__init__()
        self.cfg = cfg
        d = cfg.d
        self.proj = nn.ModuleList([nn.Linear(cfg.in_dim, d) for _ in range(N_MODS)])
        self.missing = nn.Parameter(torch.randn(N_MODS, d) * 0.02)  # kip yok / kip gizli
        self.fuse = nn.Sequential(nn.Linear(N_MODS * d, d), nn.LayerNorm(d))
        self.mask_tok = nn.Parameter(torch.randn(d) * 0.02)
        self.cls_tok = nn.Parameter(torch.randn(d) * 0.02)
        self.syn_proj = nn.Linear(cfg.in_dim, d)
        self.syn_missing = nn.Parameter(torch.randn(d) * 0.02)
        self.tag_mlp = nn.Sequential(nn.Linear(cfg.tag_dim, d), nn.GELU(), nn.Dropout(cfg.dropout), nn.Linear(d, d))
        self.type_emb = nn.Embedding(3, d)  # 0 çekim · 1 [CLS] · 2 [GLOBAL]
        self.in_drop = nn.Dropout(cfg.dropout)
        layer = nn.TransformerEncoderLayer(d, cfg.heads, cfg.ff, cfg.dropout, activation="gelu",
                                           batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, cfg.layers, enable_nested_tensor=False)
        self.out_norm = nn.LayerNorm(d)
        self.heads = nn.ModuleList([nn.Linear(d, cfg.in_dim) for _ in range(N_MODS)])
        # Kip başına eğitim derlemi ortalaması: CLIP/CLAP vektörleri yönsüz değildir (rastgele iki çekimin kosinüsü
        # ≈ 0,8); ortalama çıkarılıp yeniden birim uzunluğa getirilince hem girdi hem hedef ayırt edici olur ve
        # "ortalamayı tahmin et" kestirmesi ödüllendirilmez. Ağırlıklarla birlikte saklanır.
        self.register_buffer("center", torch.zeros(N_MODS, cfg.in_dim))

    def set_center(self, center: torch.Tensor) -> None:
        self.center.copy_(center)

    def centred(self, feats: torch.Tensor) -> torch.Tensor:
        """(…, 3, in_dim) → ortalaması çıkarılmış, birim uzunlukta."""
        return F.normalize(feats - self.center, dim=-1)

    def n_params(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def global_token(self, b: Batch) -> torch.Tensor:
        syn = torch.where(b.synopsis_ok[:, None], self.syn_proj(b.synopsis), self.syn_missing.expand(len(b.tags), -1))
        return syn + self.tag_mlp(b.tags)

    def forward(self, b: Batch) -> tuple[torch.Tensor, torch.Tensor]:
        """Dönen: (h, pred) — h (B, L, d) bağlamsal çekim vektörleri, pred (B, L, 3, in_dim) kip tahminleri."""
        B, L = b.pad.shape
        d = self.cfg.d
        parts = []
        feats = self.centred(b.feats)
        for m in range(N_MODS):
            p = self.proj[m](feats[:, :, m])
            use = b.ok[:, :, m] & ~b.hide_mod[:, :, m]
            parts.append(torch.where(use[..., None], p, self.missing[m].expand(B, L, d)))
        x = self.fuse(torch.cat(parts, dim=-1))
        x = torch.where(b.hide_shot[..., None], self.mask_tok.expand(B, L, d), x)
        x = x + sinusoid(L, d, x.device)[None] + self.type_emb.weight[0]
        special = [self.cls_tok.expand(B, d) + self.type_emb.weight[1]]
        if self.cfg.use_global:
            special.append(self.global_token(b) + self.type_emb.weight[2])
        k = len(special)
        seq = torch.cat([torch.stack(special, dim=1), x], dim=1)
        pad = torch.cat([torch.zeros(B, k, dtype=torch.bool, device=x.device), b.pad], dim=1)
        h = self.encoder(self.in_drop(seq), src_key_padding_mask=pad)
        h = self.out_norm(h[:, k:])
        pred = torch.stack([self.heads[m](h) for m in range(N_MODS)], dim=2)
        return h, pred


def msm_loss(pred: torch.Tensor, b: Batch, mod_weight: float = 0.5,
             center: torch.Tensor | None = None) -> tuple[torch.Tensor, dict[str, float]]:
    """Kosinüs uzaklığı (1 − cos): gizlenen çekimlerin VAR OLAN tüm kipleri + tek başına gizlenen kipler.
    Hedef, ortalaması çıkarılmış özgün tek kipli vektördür (`center`)."""
    target = b.feats if center is None else b.feats - center
    cos = F.cosine_similarity(pred, target, dim=-1)  # (B, L, 3)
    live = ~b.pad[..., None] & b.ok
    shot_t = live & b.hide_shot[..., None]
    mod_t = live & b.hide_mod
    dist = 1.0 - cos
    l_shot = dist[shot_t].mean() if shot_t.any() else dist.sum() * 0
    l_mod = dist[mod_t].mean() if mod_t.any() else dist.sum() * 0
    loss = l_shot + mod_weight * l_mod
    return loss, {"shot": float(l_shot.detach()), "mod": float(l_mod.detach()), "n_shot": int(shot_t.sum()), "n_mod": int(mod_t.sum())}


def window_starts(n: int, length: int, stride: int) -> list[int]:
    """Uzun dizi için örtüşen pencere başlangıçları (son pencere sona dayanır)."""
    if n <= length:
        return [0]
    starts = list(range(0, n - length + 1, stride))
    if starts[-1] != n - length:
        starts.append(n - length)
    return starts


def window_weights(length: int) -> torch.Tensor:
    """Pencere içi ağırlık: kenarlar az, orta çok (kenardaki çekimin bağlamı eksiktir)."""
    x = (torch.arange(length, dtype=torch.float32) + 0.5) / length
    return 0.1 + torch.sin(math.pi * x)
