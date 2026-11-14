"""Eğitim döngüsü ve dizilerin kurulması (train.py, evaluate.py, export.py ve serve.py ortak kullanır)."""

from __future__ import annotations

import json
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .context import TagLayout
from .corpus import Input, is_open, load_titles
from .dataset import MODS, Sequence, collate, crop, make_sequence, modality_mask, shot_mask, swap_context
from .features import SynopsisCache, context_text, load_cached
from .model import MediaFMMini, ModelConfig, msm_loss


def seed_all(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def build_sequence(inp: Input, layout: TagLayout, syn: SynopsisCache, extractor=None) -> Sequence | None:
    """Önbellekteki özniteliklerden bir dizi kurar (öznitelik yoksa ve çıkarıcı verilmemişse None)."""
    f = load_cached(inp["videoId"])
    if f is None or f.n != len(inp["shots"]):
        if extractor is None:
            return None
        f = extractor.compute(inp)
    ctx = inp["context"]
    mods = {m: f.get(m) for m in MODS}
    return make_sequence(inp["videoId"], inp["titleId"], mods, syn.get(context_text(ctx), extractor),
                         layout.vector(ctx), {"method": inp["method"], "title": ctx["title"]})


def modality_means(seqs: list[Sequence], dim: int) -> np.ndarray:
    """Eğitim dizilerinde kip başına (var olan çekimler üzerinden) ortalama vektör; kip hiç yoksa sıfır."""
    out = np.zeros((len(MODS), dim), np.float32)
    for m in range(len(MODS)):
        rows = [s.feats[s.ok[:, m], m] for s in seqs if s.ok[:, m].any()]
        if rows:
            out[m] = np.concatenate(rows).mean(0)
    return out


def training_pool(inputs: list[Input], seqs: dict[int, Sequence], min_shots: int = 8) -> list[Sequence]:
    """Eğitime girebilen diziler: açık lisanslı başlık + gerçek çekimler (SCENE_DETECT) + yeterli uzunluk."""
    titles = load_titles()
    out = []
    for inp in inputs:
        s = seqs.get(inp["videoId"])
        t = titles.get(inp["titleId"])
        if s is None or t is None or inp["method"] != "SCENE_DETECT" or s.n < min_shots:
            continue
        if is_open(t.licence):
            out.append(s)
    return out


@dataclass
class TrainConfig:
    seed: int = 7
    batch: int = 8
    lr: float = 1e-3
    weight_decay: float = 0.05
    max_epochs: int = 300
    patience: int = 40
    warmup: int = 10
    mask_ratio: float = 0.2
    mod_mask_p: float = 0.15
    mod_weight: float = 0.5
    crops_per_window: float = 2.0  # dönem başına, her max_len'lik dilim için bu kadar rastgele pencere
    fixed_epochs: int | None = None  # verilirse doğrulama olmadan bu kadar dönem
    match_weight: float = 0.5  # bağlam eşleştirme kaybının ağırlığı (0 = kapalı; [GLOBAL]'sız modelde kapalı)
    match_p: float = 0.5  # yığında bağlamı başka başlıkla değiştirilen öğe oranı


@dataclass
class TrainResult:
    model: MediaFMMini
    best_epoch: int
    best_val: float | None
    log: list[dict] = field(default_factory=list)
    seconds: float = 0.0


def _items(seqs: list[Sequence], L: int, tc: TrainConfig, rng: np.random.Generator):
    items = []
    for s in seqs:
        k = max(1, math.ceil(tc.crops_per_window * s.n / L))
        for _ in range(k):
            a, b = crop(s.n, L, rng)
            ok = s.ok[a:b]
            hs = shot_mask(b - a, tc.mask_ratio, rng, eligible=ok.any(1))
            hm = modality_mask(ok, hs, tc.mod_mask_p, rng)
            items.append((s, a, b, hs, hm))
    rng.shuffle(items)
    return items


def fixed_val_items(seqs: list[Sequence], L: int, tc: TrainConfig, seed: int = 12345):
    """Doğrulama: sabit tohumla bir kez kurulan pencereler ve maskeler (her dönem aynı → karşılaştırılabilir)."""
    rng = np.random.default_rng(seed)
    items = []
    for s in seqs:
        for a in range(0, max(1, s.n - L // 2), L // 2):
            b = min(a + L, s.n)
            for _ in range(3):
                ok = s.ok[a:b]
                hs = shot_mask(b - a, tc.mask_ratio, rng, eligible=ok.any(1))
                items.append((s, a, b, hs, np.zeros_like(ok)))
    return items


@torch.no_grad()
def eval_loss(model: MediaFMMini, items, batch: int = 16) -> float:
    model.eval()
    tot, n = 0.0, 0
    for k in range(0, len(items), batch):
        b = collate(items[k : k + batch])
        _, pred = model(b)
        loss, st = msm_loss(pred, b, mod_weight=0.0, center=model.center)
        tot += float(loss) * st["n_shot"]
        n += st["n_shot"]
    return tot / max(n, 1)


def _subset(b, keep: torch.Tensor):
    from .dataset import Batch

    return Batch(*(getattr(b, f)[keep] for f in ("feats", "ok", "pad", "hide_shot", "hide_mod", "synopsis",
                                                 "synopsis_ok", "tags", "title")))


def train(train_seqs: list[Sequence], val_seqs: list[Sequence], mc: ModelConfig, tc: TrainConfig,
          log_every: int = 10, log=print) -> TrainResult:
    seed_all(tc.seed)
    torch.set_num_threads(2)
    model = MediaFMMini(mc)
    model.set_center(torch.from_numpy(modality_means(train_seqs, mc.in_dim)))
    opt = torch.optim.AdamW(model.parameters(), lr=tc.lr, weight_decay=tc.weight_decay)
    epochs = tc.fixed_epochs or tc.max_epochs
    # Öğrenme oranı takvimi her zaman max_epochs'a göre: son model (fixed_epochs) CV'deki koşuların ilk N dönemiyle
    # aynı takvimi görür, yani CV'de seçilen dönem sayısı aynı anlama gelir.
    horizon = tc.max_epochs
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda e: min(1.0, (e + 1) / tc.warmup) * 0.5 * (1 + math.cos(math.pi * min(e / horizon, 1.0))))
    rng = np.random.default_rng(tc.seed)
    val_items = fixed_val_items(val_seqs, mc.max_len, tc) if val_seqs and not tc.fixed_epochs else []
    best, best_ep, best_state, bad = math.inf, 0, None, 0
    hist: list[dict] = []
    t0 = time.monotonic()
    for ep in range(1, epochs + 1):
        model.train()
        items = _items(train_seqs, mc.max_len, tc, rng)
        tl, ts, tm, nb, tmatch = 0.0, 0.0, 0.0, 0, 0.0
        for k in range(0, len(items), tc.batch):
            b = collate(items[k : k + tc.batch])
            use_match = tc.match_weight > 0 and mc.use_global
            label = swap_context(b, tc.match_p, rng) if use_match else None
            _, pred = model(b)
            loss, st = msm_loss(pred, b, tc.mod_weight, center=model.center)
            if label is not None:
                # MSM kaybı yalnız bağlamı doğru olan öğelerden; eşleştirme kaybı hepsinden
                logit = model.match_head(model.last_cls).squeeze(-1)
                l_match = F.binary_cross_entropy_with_logits(logit, label)
                keep = label.bool()
                if not keep.all():
                    sub = _subset(b, keep)
                    loss, st = msm_loss(pred[keep], sub, tc.mod_weight, center=model.center)
                loss = loss + tc.match_weight * l_match
                tmatch += float(l_match.detach())
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tl += float(loss.detach())
            ts += st["shot"]
            tm += st["mod"]
            nb += 1
        sched.step()
        row = {"epoch": ep, "train_loss": tl / nb, "train_shot": ts / nb, "train_mod": tm / nb, "train_match": tmatch / nb,
               "lr": opt.param_groups[0]["lr"]}
        if val_items:
            v = eval_loss(model, val_items)
            row["val_shot"] = v
            if v < best - 1e-4:
                best, best_ep, bad = v, ep, 0
                best_state = {k: t.detach().clone() for k, t in model.state_dict().items()}
            else:
                bad += 1
        hist.append(row)
        if ep % log_every == 0 or ep == 1:
            log(" ".join(f"{k}={v:.4f}" if isinstance(v, float) else f"{k}={v}" for k, v in row.items()))
        if val_items and bad >= tc.patience:
            log(f"erken durdurma: dönem {ep}, en iyi {best_ep} (val_shot={best:.4f})")
            break
    if best_state is not None:
        model.load_state_dict(best_state)
    else:
        best_ep = len(hist)
    return TrainResult(model, best_ep, None if math.isinf(best) else best, hist, time.monotonic() - t0)


def save_checkpoint(path: Path, model: MediaFMMini, layout: TagLayout, extra: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"config": model.cfg.to_dict(), "layout": layout.to_json(), "state": model.state_dict(),
                "extra": extra}, path)


def load_checkpoint(path: Path) -> tuple[MediaFMMini, TagLayout, dict]:
    ck = torch.load(path, map_location="cpu", weights_only=False)
    model = MediaFMMini(ModelConfig(**ck["config"]))
    model.load_state_dict(ck["state"])
    model.eval()
    return model, TagLayout.from_json(ck["layout"]), ck.get("extra", {})


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1))
