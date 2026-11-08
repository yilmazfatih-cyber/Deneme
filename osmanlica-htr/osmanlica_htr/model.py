"""Küçük CRNN + CTC modeli.

Giriş: (B, 1, H, W) gri görüntü, H sabit (varsayılan 64), W değişken.
Çıkış: (T, B, C) log-olasılık; T ≈ W/4.
Varsayılan ayarlarla ~1,3 M parametre (yaklaşık 5 MB fp32, ~1,5 MB int8).
"""

from __future__ import annotations

import torch
from torch import nn


class CRNN(nn.Module):
    def __init__(self, sinif_sayisi: int, yukseklik: int = 64, kanal: int = 32, gizli: int = 128, katman: int = 2, dropout: float = 0.2):
        super().__init__()
        self.yukseklik = yukseklik
        c = kanal

        def blok(ci, co, havuz):
            katmanlar = [nn.Conv2d(ci, co, 3, padding=1, bias=False), nn.BatchNorm2d(co), nn.ReLU(inplace=True)]
            if havuz:
                katmanlar.append(nn.MaxPool2d(havuz))
            return nn.Sequential(*katmanlar)

        # Yükseklik 64 → 1; genişlik /4
        self.cnn = nn.Sequential(
            blok(1, c, (2, 2)),  # 32, W/2
            blok(c, c * 2, (2, 2)),  # 16, W/4
            blok(c * 2, c * 4, (2, 1)),  # 8
            blok(c * 4, c * 4, (2, 1)),  # 4
            blok(c * 4, c * 8, (2, 1)),  # 2
            blok(c * 8, c * 8, (2, 1)),  # 1
        )
        self.dropout = nn.Dropout(dropout)
        self.rnn = nn.LSTM(c * 8, gizli, num_layers=katman, bidirectional=True, batch_first=False, dropout=dropout if katman > 1 else 0.0)
        self.cikis = nn.Linear(gizli * 2, sinif_sayisi)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        f = self.cnn(x)  # B, C, 1, T
        assert f.shape[2] == 1, f"yükseklik {self.yukseklik} ile uyumsuz özellik haritası: {f.shape}"
        f = f.squeeze(2).permute(2, 0, 1)  # T, B, C
        f = self.dropout(f)
        y, _ = self.rnn(f)
        return self.cikis(y).log_softmax(-1)  # T, B, sinif

    @staticmethod
    def zaman_adimi(genislik: int) -> int:
        return genislik // 4

    def parametre_sayisi(self) -> int:
        return sum(p.numel() for p in self.parameters())


def model_kaydet(yol, model: CRNN, alfabe, meta: dict | None = None) -> None:
    torch.save(
        {
            "state_dict": model.state_dict(),
            "alfabe": alfabe.to_json(),
            "ayar": {"yukseklik": model.yukseklik, "kanal": model.cnn[0][0].out_channels, "gizli": model.rnn.hidden_size, "katman": model.rnn.num_layers},
            "meta": meta or {},
        },
        yol,
    )


def model_yukle(yol, cihaz: str = "cpu"):
    from .alfabe import Alfabe

    ck = torch.load(yol, map_location=cihaz, weights_only=False)
    alfabe = Alfabe.from_json(ck["alfabe"])
    a = ck["ayar"]
    model = CRNN(len(alfabe), yukseklik=a["yukseklik"], kanal=a["kanal"], gizli=a["gizli"], katman=a["katman"])
    model.load_state_dict(ck["state_dict"])
    model.to(cihaz).eval()
    return model, alfabe, ck.get("meta", {})
