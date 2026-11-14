"""mediafm-mini eğitimi.

    python train.py --cv 5        # başlığa göre 5 katlı çapraz doğrulama: her katta tam model + [GLOBAL]'sız ablasyon
    python train.py --final       # tüm açık lisanslı filmlerle son model (dönem sayısı CV'deki en iyi dönemlerin ortancası)

Çıktılar ml/.cache/runs/ altında: model dosyaları (*.pt) ve kayıp günlükleri (*.json). Tohumlar sabittir.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time

from mediafm_mini.dataset import split_by_title, title_folds
from mediafm_mini.model import ModelConfig
from mediafm_mini.paths import RUNS_DIR
from mediafm_mini.pipeline import load_all
from mediafm_mini.training import TrainConfig, save_checkpoint, train, training_pool, write_json

VARIANTS = {"full": True, "noglobal": False}


def model_config(layout_dim: int, use_global: bool) -> ModelConfig:
    return ModelConfig(tag_dim=layout_dim, use_global=use_global)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cv", type=int, default=0)
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--folds", type=int, nargs="*", default=None, help="yalnız bu katlar")
    args = ap.parse_args()
    inputs, seqs, layout = load_all()
    pool = training_pool(inputs, seqs)
    titles = sorted({s.title_id for s in pool})
    print(f"eğitim havuzu: {len(pool)} yaprak, {len(titles)} başlık, {sum(s.n for s in pool)} çekim")
    tc = TrainConfig(seed=args.seed)
    if args.cv:
        folds = title_folds(titles, args.cv, args.seed)
        write_json(RUNS_DIR / "cv" / "folds.json", {"seed": args.seed, "folds": folds})
        for f, test in enumerate(folds):
            if args.folds is not None and f not in args.folds:
                continue
            rest = [t for t in titles if t not in test]
            nxt = [t for t in folds[(f + 1) % len(folds)] if t in rest]
            val = set(nxt[:2])
            tr, va, te = split_by_title(pool, set(test), val)
            for name, use_global in VARIANTS.items():
                t0 = time.monotonic()
                print(f"── kat {f} · {name}: eğitim {len(tr)} yaprak / doğrulama {sorted(val)} / sınama {test}")
                res = train(tr, va, model_config(layout.dim, use_global), tc)
                info = {"fold": f, "variant": name, "test": test, "val": sorted(val),
                        "train_titles": sorted({s.title_id for s in tr}), "best_epoch": res.best_epoch,
                        "best_val_shot": res.best_val, "seconds": round(res.seconds, 1),
                        "params": res.model.n_params(), "train_config": tc.__dict__,
                        "model_config": res.model.cfg.to_dict()}
                save_checkpoint(RUNS_DIR / "cv" / f"fold{f}-{name}.pt", res.model, layout, info)
                write_json(RUNS_DIR / "cv" / f"fold{f}-{name}.json", {**info, "log": res.log})
                print(f"   en iyi dönem {res.best_epoch}, val_shot {res.best_val:.4f}, {time.monotonic() - t0:.0f} sn")
    if args.final:
        epochs = []
        for p in sorted((RUNS_DIR / "cv").glob("fold*-full.json")):
            epochs.append(json.loads(p.read_text())["best_epoch"])
        n_ep = int(statistics.median(epochs)) if epochs else 120
        tc.fixed_epochs = n_ep
        print(f"── son model: {len(pool)} yaprak, {n_ep} dönem (CV en iyi dönemleri: {epochs})")
        res = train(pool, [], model_config(layout.dim, True), tc)
        from datetime import datetime, timezone

        info = {"variant": "final", "trainedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "epochs": n_ep, "cv_best_epochs": epochs, "titles": titles,
                "videos": [s.video_id for s in pool], "shots": sum(s.n for s in pool), "seconds": round(res.seconds, 1),
                "params": res.model.n_params(), "train_config": tc.__dict__, "model_config": res.model.cfg.to_dict()}
        save_checkpoint(RUNS_DIR / "final.pt", res.model, layout, info)
        write_json(RUNS_DIR / "final.json", {**info, "log": res.log})
        print(f"   {res.seconds:.0f} sn, son kayıp {res.log[-1]['train_loss']:.4f}")


if __name__ == "__main__":
    main()
