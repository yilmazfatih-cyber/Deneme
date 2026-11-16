"""JavaScript çalışma zamanının eşlik testleri için Python'dan sınama vektörleri üretir.

İki küme yazar:
    tarayici/sinama/            küçük bir sınama modeli (GQA + ayrı çıkış katmanı, float16)
                                ve vektorler.json (tokenizer, çözme, logit, açgözlü üretim)
    tarayici/sinama/ornek-model.json   depodaki örnek modelin (int8) logit ve üretim vektörleri

Açgözlü üretimde her adımda en iyi iki logit arasındaki pay ölçülür; pay çok küçükse iki dilin
kayan nokta farkı sonucu değiştirebileceği için betik durur (başka istem seçin).
Çalıştırma: python scripts/tarayici_sinama.py   (sonra: node --test tarayici/)

Genişletme: Yeni bir JS özelliği eklediyseniz buraya onun vektörünü, `tarayici/*.test.js`'e de
karşılaştırmasını ekleyin.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # tests.helpers içindeki örnek derlemi kullanmak için

from dil_modeli.config import ModelConfig  # noqa: E402
from dil_modeli.export_web import export_web, load_web  # noqa: E402
from dil_modeli.generate import generate_ids  # noqa: E402
from dil_modeli.model import LanguageModel  # noqa: E402
from dil_modeli.sampling import SamplingConfig, apply_repetition_penalty  # noqa: E402
from dil_modeli.tokenizer import BPETokenizer  # noqa: E402
from dil_modeli.tokenizer_train import train_bpe  # noqa: E402
from tests.helpers import fixture_text, make_corpus, random_text  # noqa: E402

OUT = ROOT / "tarayici" / "sinama"
EXAMPLE = ROOT / "ornek-model" / "tarayici"
MIN_MARGIN = 1e-3
TEXTS = [
    "",
    "Iğdır'dan İzmir'e, Çanakkale'ye; öğle üzeri şöyle güzel bir yolculuk.",
    "Emoji: 🙂 🇹🇷 👨\u200d👩\u200d👧 ve birleşen işaret: e\u0301",
    "karışık   boşluk\t\tsekme\r\nsatır\n\n\nson  ",
    "\u00a0bölünmez\u2028ayırıcı\u200bsıfır 1.250,75 TL",
    "<|bas|>özel<|son|> belirteç yazısı <|asistan|>",
    "日本語 العربية кириллица don't 'll",
]


def _round(values: torch.Tensor) -> list[float]:
    return [float(f"{v:.6g}") for v in values.tolist()]


def _greedy(
    model: LanguageModel, prompt: list[int], steps: int, penalty: float
) -> tuple[list[int], float]:
    """Açgözlü üretim + en küçük pay (her adımda birinci ile ikinci logit farkı)."""
    config = SamplingConfig(max_new_tokens=steps, temperature=0.0, repetition_penalty=penalty)
    output = list(generate_ids(model, prompt, config))
    margin = float("inf")
    limit = model.config.max_seq_len
    history = list(prompt)
    for token in output:  # payı ayrıca ölç: aynı pencere kuralıyla önbelleksiz
        window = history[-(limit // 2) :] if len(history) >= limit else history[-(limit - 1) :]
        with torch.no_grad():
            logits = model(torch.tensor([window]))[:, -1].clone()
        if penalty != 1.0:
            logits = apply_repetition_penalty(logits, torch.tensor([history[-64:]]), penalty)
        top = torch.topk(logits[0], 2).values
        margin = min(margin, float(top[0] - top[1]))
        history.append(token)
    return output, margin


def tokenizer_vectors(tokenizer: BPETokenizer, seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    texts = [*TEXTS, *(random_text(rng, 50) for _ in range(150))]
    encode = [
        {"text": t, "ids": tokenizer.encode(t), "special": tokenizer.encode(t, allow_special=True)}
        for t in texts
    ]
    decode = []
    for _ in range(100):
        ids = [rng.randrange(tokenizer.vocab_size) for _ in range(rng.randint(1, 12))]
        decode.append({"ids": ids, "text": tokenizer.decode(ids, skip_special=False)})
    return {"encode": encode, "decode": decode}


def model_vectors(
    model: LanguageModel, tokenizer: BPETokenizer, prompts: list[str], steps: int
) -> dict[str, Any]:
    ids = [tokenizer.bos_id, *tokenizer.encode(prompts[0])][: model.config.max_seq_len]
    with torch.no_grad():
        logits = model(torch.tensor([ids]))[0]
    greedy = []
    for index, prompt in enumerate(prompts):
        prompt_ids = [tokenizer.bos_id, *tokenizer.encode(prompt)]
        penalty = 1.0 if index % 2 == 0 else 1.3
        output, margin = _greedy(model, prompt_ids, steps, penalty)
        if margin < MIN_MARGIN:
            raise SystemExit(f"İstem {prompt!r}: pay {margin:.2e} çok küçük; başka istem seçin.")
        print(f"  {prompt!r}: {len(output)} belirteç, en küçük pay {margin:.3f}")
        greedy.append({"prompt": prompt_ids, "penalty": penalty, "steps": steps, "output": output})
    return {
        "logits": {"ids": ids, "positions": [_round(row) for row in logits]},
        "greedy": greedy,
    }


def build_fixture() -> None:
    corpus = [fixture_text(), *make_corpus(lines=400)]
    tokenizer = train_bpe(corpus, vocab_size=400)
    torch.manual_seed(1)
    config = ModelConfig(
        vocab_size=tokenizer.vocab_size,
        dim=32,
        n_layer=2,
        n_head=4,
        n_kv_head=2,
        max_seq_len=32,
        tie_embeddings=False,
    )
    trained = LanguageModel(config)
    with torch.no_grad():  # rastgele model: logitleri ayırt edilebilir kılmak için gömmeleri büyüt
        trained.embed.weight.mul_(30.0)
        trained.head.weight.mul_(30.0)
    export_web(trained, tokenizer, OUT, "float16")
    model, loaded = load_web(OUT)  # vektörler açılmış (float16 -> float32) ağırlıklardan
    assert isinstance(loaded, BPETokenizer)
    vectors = {
        "tokenizer": tokenizer_vectors(loaded, seed=5),
        **model_vectors(
            model, loaded, ["Korkma, sönmez", "milletimin yıldızı", "Çatma kurban"], 70
        ),
    }
    (OUT / "vektorler.json").write_text(json.dumps(vectors, ensure_ascii=False) + "\n", "utf-8")
    print(f"Yazıldı: {OUT}")


def build_example() -> None:
    if not (EXAMPLE / "manifest.json").is_file():
        print(f"Atlandı: {EXAMPLE} yok (önce: python scripts/ornek_model.py paketle)")
        return
    model, tokenizer = load_web(EXAMPLE)
    assert isinstance(tokenizer, BPETokenizer)
    prompts = ["Türkiye'nin başkenti", "İstanbul Boğazı", "Osmanlı İmparatorluğu"]
    vectors = {
        "tokenizer": tokenizer_vectors(tokenizer, seed=6)["encode"][: len(TEXTS) + 30],
        **model_vectors(model, tokenizer, prompts, 40),
    }
    vectors["logits"]["positions"] = vectors["logits"]["positions"][-2:]  # dosya küçük kalsın
    (OUT / "ornek-model.json").write_text(json.dumps(vectors, ensure_ascii=False) + "\n", "utf-8")
    print(f"Yazıldı: {OUT / 'ornek-model.json'}")


if __name__ == "__main__":
    torch.set_num_threads(2)
    build_fixture()
    build_example()
