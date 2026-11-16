"""Örnek (b): yalnız numpy ile minik karakter düzeyi GPT, kısa bir şiiri öğreniyor.

Metin: Yunus Emre'nin (13.–14. yüzyıl) bilinen dörtlüğü — kamu malıdır. Model her konumda bir
SONRAKİ harfi tahmin etmeyi öğrenir (nedensel öz-dikkat: geleceği göremez). Eğitimden sonra
"Gelin" ile başlatıp her adımda en olası harfi seçeriz (açgözlü üretim); model metni ezberlemişse
dörtlüğün tamamını yazar. Gerçek dil modeli eğitimi için kardeş temel `havuz/dil-modeli`.
Çalıştırma: python ornekler/02_minik_gpt.py   (yaklaşık 10-30 saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel import nn, optim

TEXT = "Gelin tanış olalım\nİşi kolay kılalım\nSevelim sevilelim\nDünya kimseye kalmaz\n"
BLOCK = 24


def main() -> None:
    characters = sorted(set(TEXT))
    encode = {char: index for index, char in enumerate(characters)}
    data = np.array([encode[char] for char in TEXT])
    print(f"Metin {len(TEXT)} karakter, sözlük {len(characters)} harf.")

    config = nn.GPTConfig(
        vocab_size=len(characters), block_size=BLOCK, n_layer=2, n_head=4, n_embd=48
    )
    model = nn.GPT(config, rng=0)
    print(f"Parametre sayısı: {model.num_parameters()}")
    optimizer = optim.AdamW(model.parameters(), lr=3e-3, weight_decay=0.0)
    scheduler = optim.LRScheduler(optimizer, lambda s: optim.warmup_cosine(s, 3e-3, 20, 300, 3e-4))
    rng = np.random.default_rng(0)
    for step in range(300):
        starts = rng.integers(0, len(data) - BLOCK, size=16)  # son harf de hedef olabilsin
        inputs = np.stack([data[s : s + BLOCK] for s in starts])
        targets = np.stack([data[s + 1 : s + BLOCK + 1] for s in starts])
        scheduler.step()
        _, loss = model(inputs, targets)
        assert loss is not None
        model.zero_grad()
        loss.backward()
        optim.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % 50 == 0 or step == 299:
            print(f"adım {step:3d}  kayıp {loss.item():.3f}")

    start = np.array([[encode[char] for char in "Gelin"]])
    generated = model.generate(start, max_new_tokens=len(TEXT) - 5, temperature=0.0)
    produced = "".join(characters[index] for index in generated[0])
    print("\nÜretilen metin (açgözlü):")
    print(produced)
    print("Ezber tam mı?", produced == TEXT)


if __name__ == "__main__":
    main()
