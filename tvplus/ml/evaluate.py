"""Ayrılmış başlıklarda değerlendirme (train.py --cv sonrasında).

    python evaluate.py [--repeats 10]

Protokol: her sınama yaprağında, tohumlu `repeats` kez çekimlerin %20'si gizlenir; her gizli çekim için tahmin,
o maskede gizlenen TÜM çekimler arasında sıralanır (adaylar = aynı maskenin gizli çekimleri; görünür komşular aday
değildir, böylece "komşuyu kopyala" temeli kendini bulup haksız biçimde sıfırlanmaz). Benzerlik: hem tahminde hem
adayda var olan kiplerin kosinüs ortalaması; tüm vektörler (adaylar, temeller, model tahminleri) aynı uzayda: kip
başına eğitim derlemi ortalaması çıkarılmış tek kipli vektörler.
Karşılaştırılanlar:
  model                 tam model (bağlam: başlığın kendi özeti + GEÇERLİ etiketleri)
  model_ctx_shuffled    aynı model, özet + etiketler başka bir başlığınkiyle değiştirilmiş
  model_ctx_blank       aynı model, özet yok + etiket yok
  model_noglobal        [GLOBAL] belirteci olmadan ayrıca eğitilmiş model (ablasyon)
  nearest_visible       temel: en yakın görünür komşu çekimin vektörleri
  neighbour_mean        temel: soldaki ve sağdaki en yakın görünür çekimlerin ortalaması
  model_visible_ref     üst referans: çekim GİZLENMEDEN modelin aynı çekim için tahmini (yeniden kurma)
İkinci görev — bağlam eşleştirme (bağlamın gerçekten kullanılıp kullanılmadığı): ayrılmış her başlığın çekim dizisi,
havuzdaki TÜM başlıkların özet + etiketleriyle ayrı ayrı modele verilir; eşleştirme puanına göre kendi bağlamının
sırası. Temel: filmin ortalama CLIP görüntü vektörü ile özetin çok dilli CLIP metin vektörü arasındaki kosinüs (aynı
ortak uzay, eğitimsiz).
Çıktı: ml/.cache/runs/cv/metrics.json (+ ekrana tablo).
"""

from __future__ import annotations

import argparse
import copy
import json

import numpy as np

from mediafm_mini.context import TagLayout
from mediafm_mini.dataset import Sequence
from mediafm_mini.infer import encode, match_logit
from mediafm_mini.metrics import modal_scores, nearest_visible, neighbour_sides, ranks, summarize
from mediafm_mini.paths import RUNS_DIR
from mediafm_mini.pipeline import load_all
from mediafm_mini.training import load_checkpoint, training_pool, write_json

MASK_RATIO = 0.2
METHODS = ("model", "model_ctx_shuffled", "model_ctx_blank", "model_noglobal", "nearest_visible",
           "neighbour_mean", "model_visible_ref")


def with_context(s: Sequence, donor: Sequence | None) -> Sequence:
    t = copy.copy(s)
    if donor is None:  # bağlam boş: özet yok, etiket yok
        t.synopsis = np.zeros_like(s.synopsis)
        t.synopsis_ok = False
        t.tags = np.zeros_like(s.tags)
    else:
        t.synopsis, t.synopsis_ok, t.tags = donor.synopsis, donor.synopsis_ok, donor.tags
    return t


def baseline_pred(s: Sequence, i: int, hidden: np.ndarray, kind: str) -> tuple[np.ndarray, np.ndarray]:
    if kind == "nearest_visible":
        j = nearest_visible(i, hidden)
        return (s.feats[j], s.ok[j]) if j is not None else (np.zeros_like(s.feats[i]), np.zeros(3, bool))
    left, right = neighbour_sides(i, hidden)
    js = [j for j in (left, right) if j is not None]
    f = np.zeros_like(s.feats[i])
    ok = np.zeros(3, bool)
    for m in range(3):
        rows = [s.feats[j, m] for j in js if s.ok[j, m]]
        if rows:
            v = np.mean(rows, 0)
            f[m] = v / max(np.linalg.norm(v), 1e-12)
            ok[m] = True
    return f, ok


def evaluate_sequence(s: Sequence, models: dict, donor: Sequence, repeats: int, seed: int) -> dict[str, list]:
    rng = np.random.default_rng(seed + s.video_id)
    out: dict[str, list] = {m: [] for m in METHODS}
    eligible = np.nonzero(s.ok.any(1))[0]
    k = max(2, int(round(MASK_RATIO * s.n)))
    if len(eligible) < 3:
        return out
    ctx_variants = {"model": s, "model_ctx_shuffled": with_context(s, donor), "model_ctx_blank": with_context(s, None)}
    _, pred_visible = encode(models["full"], s)
    # Adaylar ve temeller, modelin hedef uzayında (kip ortalaması çıkarılmış) karşılaştırılır — hepsi için aynı dönüşüm.
    cs = copy.copy(s)
    cs.feats = np.where(s.ok[..., None], s.feats - models["full"].center.numpy()[None], 0.0).astype(np.float32)
    for _ in range(repeats):
        hidden = np.zeros(s.n, bool)
        hidden[rng.choice(eligible, size=min(k, len(eligible) - 1), replace=False)] = True
        idx = np.nonzero(hidden)[0]
        cand, cand_ok = cs.feats[idx], s.ok[idx]
        true = np.arange(len(idx))
        preds: dict[str, tuple[np.ndarray, np.ndarray]] = {}
        for name, seq in ctx_variants.items():
            _, p = encode(models["full"], seq, hide_shot=hidden)
            preds[name] = (p[idx], np.ones((len(idx), 3), bool))
        _, p = encode(models["noglobal"], s, hide_shot=hidden)
        preds["model_noglobal"] = (p[idx], np.ones((len(idx), 3), bool))
        preds["model_visible_ref"] = (pred_visible[idx], np.ones((len(idx), 3), bool))
        for kind in ("nearest_visible", "neighbour_mean"):
            rows = [baseline_pred(cs, i, hidden, kind) for i in idx]
            preds[kind] = (np.stack([r[0] for r in rows]), np.stack([r[1] for r in rows]))
        for name, (p, p_ok) in preds.items():
            sc = modal_scores(p, p_ok, cand, cand_ok)
            out[name].extend((int(r), len(idx)) for r in ranks(sc, true))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=10)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()
    folds = json.loads((RUNS_DIR / "cv" / "folds.json").read_text())["folds"]
    full0, layout, _ = load_checkpoint(RUNS_DIR / "cv" / "fold0-full.pt")
    inputs, seqs, _ = load_all(layout)
    pool = training_pool(inputs, seqs)
    by_title: dict[int, list[Sequence]] = {}
    for s in pool:
        by_title.setdefault(s.title_id, []).append(s)
    titles = sorted(by_title)
    # bağlam karıştırma: her başlığa sabit bir "başka başlık" (döngüsel kaydırma = hiçbir başlık kendisini almaz)
    donor_title = {t: titles[(i + len(titles) // 2) % len(titles)] for i, t in enumerate(titles)}
    allq: dict[str, list] = {m: [] for m in METHODS}
    per_title: dict[str, dict] = {}
    for f, test in enumerate(folds):
        models = {v: load_checkpoint(RUNS_DIR / "cv" / f"fold{f}-{v}.pt")[0] for v in ("full", "noglobal")}
        for t in test:
            tq: dict[str, list] = {m: [] for m in METHODS}
            for s in by_title.get(t, []):
                r = evaluate_sequence(s, models, by_title[donor_title[t]][0], args.repeats, args.seed)
                for m in METHODS:
                    tq[m].extend(r[m])
                    allq[m].extend(r[m])
            name = by_title[t][0].meta["title"]
            per_title[str(t)] = {"title": name, "fold": f, "shots": sum(s.n for s in by_title[t]),
                                 **{m: summarize(np.array([a for a, _ in tq[m]]), np.array([b for _, b in tq[m]]))
                                    for m in METHODS}}
    # bağlam eşleştirme
    ctx_rows = []
    for f, test in enumerate(folds):
        full = load_checkpoint(RUNS_DIR / "cv" / f"fold{f}-full.pt")[0]
        for t in test:
            for s in by_title.get(t, []):
                sc_model, sc_base = [], []
                vis = s.feats[s.ok[:, 0], 0].mean(0)
                for u in titles:
                    d = by_title[u][0]
                    sc_model.append(match_logit(full, with_context(s, d)))
                    sc_base.append(float(vis @ d.synopsis / (np.linalg.norm(vis) * np.linalg.norm(d.synopsis) + 1e-9))
                                   if d.synopsis_ok else -1.0)
                ti = titles.index(t)
                ctx_rows.append({"videoId": s.video_id, "title": s.meta["title"], "fold": f,
                                 "model_rank": int(ranks(np.array([sc_model]), np.array([ti]))[0]),
                                 "clip_baseline_rank": int(ranks(np.array([sc_base]), np.array([ti]))[0])})
    n_cand = len(titles)
    context_match = {"candidates": n_cand, "videos": ctx_rows,
                     "model": summarize(np.array([r["model_rank"] for r in ctx_rows]), np.full(len(ctx_rows), n_cand)),
                     "clip_baseline": summarize(np.array([r["clip_baseline_rank"] for r in ctx_rows]),
                                                np.full(len(ctx_rows), n_cand))}
    overall = {m: summarize(np.array([a for a, _ in allq[m]]), np.array([b for _, b in allq[m]])) for m in METHODS}
    # başlık başına ortalama (makro): uzun filmler sonucu domine etmesin
    macro = {m: {k: float(np.mean([per_title[t][m][k] for t in per_title if per_title[t][m].get("queries")]))
                 for k in ("R@1", "R@5", "mean_rank", "norm_rank", "MRR")} for m in METHODS}
    res = {"protocol": __doc__.split("Çıktı:")[0].strip(), "mask_ratio": MASK_RATIO, "repeats": args.repeats,
           "seed": args.seed, "folds": folds, "overall_micro": overall, "overall_macro_by_title": macro,
           "per_title": per_title,
           "context_match": context_match}
    write_json(RUNS_DIR / "cv" / "metrics.json", res)
    print(f"{'yöntem':22s} {'R@1':>6s} {'R@5':>6s} {'ort.sıra':>8s} {'norm.sıra':>9s} {'MRR':>6s}  (mikro; adaylar ≈ "
          f"{overall['model']['candidates_mean']:.1f}, rastgele R@1 {overall['model']['random_R@1']:.3f})")
    for m in METHODS:
        o = overall[m]
        print(f"{m:22s} {o['R@1']:6.3f} {o['R@5']:6.3f} {o['mean_rank']:8.2f} {o['norm_rank']:9.3f} {o['MRR']:6.3f}")
    print(f"bağlam eşleştirme ({n_cand} aday başlık, {len(ctx_rows)} sınama yaprağı):")
    for m in ("model", "clip_baseline"):
        o = context_match[m]
        print(f"  {m:20s} R@1 {o['R@1']:.3f} R@5 {o['R@5']:.3f} ort.sıra {o['mean_rank']:.2f} "
              f"(rastgele R@1 {o['random_R@1']:.3f})")
    print("makro (başlık ortalaması):")
    for m in METHODS:
        o = macro[m]
        print(f"{m:22s} {o['R@1']:6.3f} {o['R@5']:6.3f} {o['mean_rank']:8.2f} {o['norm_rank']:9.3f} {o['MRR']:6.3f}")


if __name__ == "__main__":
    main()
