"""Eğitilmiş modelle TÜM katalog yapraklarını kodlar ve sunucunun okuduğu biçimde dışa aktarır.

    python export.py [--checkpoint .cache/runs/final.pt] [--out ../content/models/mediafm-mini]

Yazılanlar (belirlenimci: aynı ağırlık + aynı girdi → bayt bayt aynı dosyalar):
  manifest.json · vectors.jsonl (yaprak başına çekim vektörleri + havuz vektörü) · title-vectors.json (başlık başına,
  bilgi için; sunucu kendi hesaplar) · model.safetensors + config.json (ağırlıklar) · metrics.json · model-card.md
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from mediafm_mini import MODEL_ID
from mediafm_mini.card import render_card
from mediafm_mini.corpus import load_titles
from mediafm_mini.export_format import check_vectors_file, manifest, model_line, save_weights, video_line
from mediafm_mini.infer import encode, l2n, pooled
from mediafm_mini.paths import FEATURE_DIR, MODEL_OUT_DIR, RUNS_DIR
from mediafm_mini.pipeline import load_all
from mediafm_mini.training import load_checkpoint, training_pool


def r4(x: float) -> float:
    return round(float(x), 4)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, default=RUNS_DIR / "final.pt")
    ap.add_argument("--out", type=Path, default=MODEL_OUT_DIR)
    args = ap.parse_args()
    model, layout, info = load_checkpoint(args.checkpoint)
    inputs, seqs, _ = load_all(layout)
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    wsha = hashlib.sha256(b"".join(t.detach().numpy().tobytes() for t in model.state_dict().values())).hexdigest()
    version = f"{info['trainedAt'][:10]}-{wsha[:8]}"
    dims = model.cfg.d
    lines = [model_line(MODEL_ID, version, dims)]
    pooled_by_video: dict[int, np.ndarray] = {}
    title_of: dict[int, int] = {}
    method: dict[int, str] = {}
    for inp in sorted(inputs, key=lambda x: x["videoId"]):
        s = seqs.get(inp["videoId"])
        if s is None:
            continue
        h, _ = encode(model, s)
        h = l2n(h)
        p = pooled(h)
        lines.append(video_line(inp["videoId"], inp["titleId"], h, p))
        pooled_by_video[inp["videoId"]] = p
        title_of[inp["videoId"]] = inp["titleId"]
        method[inp["videoId"]] = inp["method"]
    (out / "vectors.jsonl").write_text("\n".join(lines) + "\n")
    expected = {i["videoId"]: len(i["shots"]) for i in inputs if i["videoId"] in seqs}
    chk = check_vectors_file(out / "vectors.jsonl", expected)

    titles = load_titles()
    tv: dict[str, dict] = {}
    for t in sorted(set(title_of.values())):
        vids = [v for v, tt in title_of.items() if tt == t]
        vec = l2n(np.mean([pooled_by_video[v] for v in vids], 0))
        tv[str(t)] = {"title": titles[t].title if t in titles else "", "videos": len(vids),
                      "method": "SCENE_DETECT" if any(method[v] == "SCENE_DETECT" for v in vids) else "KEYFRAMES",
                      "vector": [round(float(x), 5) for x in vec]}
    (out / "title-vectors.json").write_text(json.dumps({"model": f"{MODEL_ID}@{version}", "dims": dims,
                                                        "note": "Bilgi için; sunucu başlık vektörünü kendisi kurar.",
                                                        "titles": tv}, ensure_ascii=False) + "\n")

    save_weights(out, model, layout, {"version": version, "trainedAt": info["trainedAt"]})

    cv = json.loads((RUNS_DIR / "cv" / "metrics.json").read_text())
    final_log = json.loads((RUNS_DIR / "final.json").read_text())
    folds = []
    for f in range(len(cv["folds"])):
        for v in ("full", "noglobal"):
            j = json.loads((RUNS_DIR / "cv" / f"fold{f}-{v}.json").read_text())
            folds.append({"fold": f, "variant": v, "test": j["test"], "val": j["val"], "best_epoch": j["best_epoch"],
                          "best_val_shot": r4(j["best_val_shot"]), "epochs_run": len(j["log"]), "seconds": j["seconds"]})
    pool = training_pool(inputs, seqs)
    stats = json.loads((FEATURE_DIR / "stats.json").read_text())
    data = []
    for inp in inputs:
        st = stats.get(str(inp["videoId"]), {})
        t = titles.get(inp["titleId"])
        data.append({"videoId": inp["videoId"], "titleId": inp["titleId"], "title": inp["context"]["title"],
                     "method": inp["method"], "shots": len(inp["shots"]), "visual": st.get("visual", 0),
                     "audio": st.get("audio", 0), "text": st.get("text", 0),
                     "licence": t.licence if t else "", "inTraining": any(s.video_id == inp["videoId"] for s in pool)})
    metrics = {
        "model": f"{MODEL_ID}@{version}", "params": model.n_params(), "dims": dims,
        "evaluation": {k: cv[k] for k in ("protocol", "mask_ratio", "repeats", "seed", "folds", "overall_micro",
                                          "overall_macro_by_title", "per_title")},
        "cv_training": folds,
        "final_training": {k: final_log[k] for k in ("epochs", "cv_best_epochs", "titles", "videos", "shots",
                                                      "seconds", "trainedAt")}
        | {"loss_first": r4(final_log["log"][0]["train_loss"]), "loss_last": r4(final_log["log"][-1]["train_loss"]),
           "loss_by_epoch": [r4(r["train_loss"]) for r in final_log["log"]]},
        "data": data,
        "export": chk,
    }
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1) + "\n")
    man = manifest(MODEL_ID, version, dims, info["trainedAt"],
                   f"mediafm-mini: {len(pool)} açık lisanslı yaprakta ({sum(s.n for s in pool)} gerçek çekim) CPU'da "
                   f"maskeli çekim modellemesiyle eğitilmiş {model.n_params():,} parametreli kaynaştırma dönüştürücüsü; "
                   "dondurulmuş CLIP ViT-B/32 (görüntü), çok dilli CLIP metin, CLAP (ses) kodlayıcıları. Küçük bir "
                   "örnektir, temel model değildir. Ayrıntı: model-card.md, metrics.json.", ["vectors.jsonl"])
    (out / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n")
    (out / "model-card.md").write_text(render_card(metrics, man, model.cfg.to_dict(), final_log["train_config"]))
    sizes = {p.name: p.stat().st_size for p in sorted(out.iterdir())}
    print(json.dumps({"version": version, **chk, "bytes": sizes, "total_MB": round(sum(sizes.values()) / 1e6, 2)},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
