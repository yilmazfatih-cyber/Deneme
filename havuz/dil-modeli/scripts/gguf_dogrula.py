"""GGUF dosyasını llama.cpp çalıştırmadan doğrular: üst veri, tokenizer, tensörler ve logitler.

llama.cpp, LLaMA mimarisinde RoPE'yi komşu çiftlere (x[2i], x[2i+1]) uygular; dönüştürücü bu
yüzden q/k ağırlıklarının satırlarını yeniden sıralar. Bu betik GGUF'taki ağırlıklarla
llama.cpp'nin düzeninde numpy ileri geçişi yapar ve sonucu bu paketin modeliyle karşılaştırır
(logitler + açgözlü üretim). llama.cpp/Ollama'nın kendisini çalıştırmaz.
Gerekenler: pip install -e ".[gguf]"
Kullanım: python scripts/gguf_dogrula.py --gguf calisma/model.gguf --model ornek-model

Genişletme: Nicemlenmiş (q8_0 vb.) dosyaları doğrulamak için `_tensors` içinde gguf'un
`quants.dequantize` işlevini kullanın; şimdilik yalnız f32/f16 desteklenir.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dil_modeli.generate import generate_ids
from dil_modeli.model_io import load_model
from dil_modeli.sampling import SamplingConfig
from dil_modeli.tokenizer import BPETokenizer

Weights = dict[str, np.ndarray]


def _metadata(reader: Any) -> dict[str, Any]:
    skip = ("tokenizer.ggml.tokens", "tokenizer.ggml.token_type", "tokenizer.ggml.merges")
    return {key: field.contents() for key, field in reader.fields.items() if key not in skip}


def _tensors(reader: Any) -> Weights:
    weights = {}
    for tensor in reader.tensors:
        if tensor.tensor_type.name not in ("F32", "F16"):
            raise SystemExit(
                f"{tensor.name}: {tensor.tensor_type.name} doğrulanamıyor; f32/f16 dönüştürün."
            )
        weights[tensor.name] = np.asarray(tensor.data, dtype=np.float64)
    return weights


def _rmsnorm(x: np.ndarray, weight: np.ndarray, eps: float) -> np.ndarray:
    normed: np.ndarray = x / np.sqrt((x * x).mean(-1, keepdims=True) + eps) * weight
    return normed


def forward(w: Weights, meta: dict[str, Any], ids: list[int]) -> np.ndarray:
    """llama.cpp düzeninde (komşu çift RoPE) önbelleksiz ileri geçiş -> (uzunluk, sözlük)."""
    heads, kv_heads = meta["llama.attention.head_count"], meta["llama.attention.head_count_kv"]
    dim, eps = meta["llama.embedding_length"], meta["llama.attention.layer_norm_rms_epsilon"]
    head_dim, length = dim // heads, len(ids)
    angles = np.arange(length)[:, None] * meta["llama.rope.freq_base"] ** (
        -np.arange(0, head_dim, 2) / head_dim
    )
    cos, sin = np.cos(angles)[:, None, :], np.sin(angles)[:, None, :]

    def rope(v: np.ndarray, n: int) -> np.ndarray:
        pairs = v.reshape(length, n, head_dim // 2, 2)
        a, b = pairs[..., 0], pairs[..., 1]
        return np.stack([a * cos - b * sin, a * sin + b * cos], -1).reshape(length, n, head_dim)

    x = w["token_embd.weight"][ids]
    future = np.triu(np.ones((length, length), dtype=bool), 1)
    for i in range(meta["llama.block_count"]):
        p = f"blk.{i}."
        h = _rmsnorm(x, w[p + "attn_norm.weight"], eps)
        q = rope(h @ w[p + "attn_q.weight"].T, heads)
        k = np.repeat(rope(h @ w[p + "attn_k.weight"].T, kv_heads), heads // kv_heads, axis=1)
        v = np.repeat(
            (h @ w[p + "attn_v.weight"].T).reshape(length, kv_heads, head_dim), heads // kv_heads, 1
        )
        scores = np.einsum("thd,shd->hts", q, k) / math.sqrt(head_dim)
        scores[:, future] = -np.inf
        probs = np.exp(scores - scores.max(-1, keepdims=True))
        probs /= probs.sum(-1, keepdims=True)
        x = (
            x
            + np.einsum("hts,shd->thd", probs, v).reshape(length, dim)
            @ w[p + "attn_output.weight"].T
        )
        h = _rmsnorm(x, w[p + "ffn_norm.weight"], eps)
        gate, up = h @ w[p + "ffn_gate.weight"].T, h @ w[p + "ffn_up.weight"].T
        x = x + (gate / (1 + np.exp(-gate)) * up) @ w[p + "ffn_down.weight"].T
    x = _rmsnorm(x, w["output_norm.weight"], eps)
    logits: np.ndarray = x @ w.get("output.weight", w["token_embd.weight"]).T
    return logits


def main() -> None:
    import gguf

    parser = argparse.ArgumentParser(
        description="GGUF dosyasını bu paketin modeliyle karşılaştırır."
    )
    parser.add_argument("--gguf", type=Path, required=True, help="GGUF dosyası")
    parser.add_argument("--model", type=Path, required=True, help="aynı modelin klasörü")
    parser.add_argument("--istem", default="Türkiye'nin başkenti", help="denenecek istem")
    args = parser.parse_args()
    reader = gguf.GGUFReader(str(args.gguf))
    meta, weights = _metadata(reader), _tensors(reader)
    model, tokenizer = load_model(args.model)
    assert isinstance(tokenizer, BPETokenizer)
    tokens = reader.fields["tokenizer.ggml.tokens"].contents()
    merges = reader.fields["tokenizer.ggml.merges"].contents()
    checks = {
        "mimari llama": meta["general.architecture"] == "llama",
        "ön-bölme gpt-2": meta["tokenizer.ggml.pre"] == "gpt-2",
        "sözlük aynı": tokens == [tokenizer.id_to_token(i) for i in range(tokenizer.vocab_size)],
        "birleştirmeler aynı": merges == [f"{a} {b}" for a, b in tokenizer.merges],
    }
    ids = [tokenizer.bos_id, *tokenizer.encode(args.istem)]
    with torch.no_grad():
        ours = model(torch.tensor([ids]))[0].double().numpy()
    difference = float(np.abs(forward(weights, meta, ids) - ours).max())
    half = any(t.tensor_type.name == "F16" for t in reader.tensors)
    tolerance = 2e-2 if half else 1e-3  # f16 ağırlıklar yuvarlandığı için daha geniş pay
    checks[f"logitler (fark < {tolerance:g})"] = difference < tolerance
    greedy = list(generate_ids(model, ids, SamplingConfig(20, temperature=0.0)))
    sequence = list(ids)
    for _ in range(20):
        sequence.append(int(forward(weights, meta, sequence)[-1].argmax()))
    checks["açgözlü 20 belirteç aynı"] = sequence[len(ids) :] == greedy
    for name, ok in checks.items():
        print(f"  {'tamam' if ok else 'HATA '}  {name}")
    print(
        f"En büyük logit farkı: {difference:.2e}; "
        f"GGUF çıktısı: {tokenizer.decode(sequence[len(ids) :])!r}"
    )
    raise SystemExit(0 if all(checks.values()) else 1)


if __name__ == "__main__":
    main()
