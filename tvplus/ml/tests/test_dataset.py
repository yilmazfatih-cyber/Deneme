import numpy as np
import torch

from mediafm_mini.dataset import (
    Sequence, collate, crop, make_sequence, modality_mask, shot_mask, split_by_title, title_folds,
)


def seq(vid: int, tid: int, n: int, D: int = 4, T: int = 3) -> Sequence:
    rng = np.random.default_rng(vid)
    mods = {m: (rng.normal(size=(n, D)).astype(np.float32), np.ones(n, bool)) for m in ("visual", "audio", "text")}
    mods["text"] = (mods["text"][0], np.arange(n) % 2 == 0)  # konuşma yalnız çift çekimlerde
    return make_sequence(vid, tid, mods, np.ones(D, np.float32), np.zeros(T, np.float32))


def test_missing_modalities_are_explicit_and_zeroed():
    s = seq(1, 1, 5)
    assert s.ok.shape == (5, 3)
    assert not s.ok[1, 2] and s.ok[0, 2]
    assert np.all(s.feats[1, 2] == 0)  # eksik kip veri gibi davranmaz
    s2 = make_sequence(2, 2, {m: (np.ones((2, 4)), np.zeros(2, bool)) for m in ("visual", "audio", "text")},
                       None, np.zeros(3))
    assert not s2.synopsis_ok and np.all(s2.synopsis == 0)


def test_title_folds_and_split_never_leak_titles():
    seqs = [seq(10, 1, 4), seq(11, 1, 4), seq(20, 2, 4), seq(30, 3, 4), seq(40, 4, 4)]
    folds = title_folds([s.title_id for s in seqs], 2, seed=0)
    assert sorted(sum(folds, [])) == [1, 2, 3, 4]
    tr, va, te = split_by_title(seqs, set(folds[0]), {t for t in folds[1][:1]})
    assert {s.title_id for s in tr}.isdisjoint({s.title_id for s in te} | {s.title_id for s in va})
    # aynı başlığın iki yaprağı aynı tarafta
    assert len({s.title_id in folds[0] for s in seqs if s.title_id == 1}) == 1
    assert title_folds([1, 2, 3, 4], 2, seed=0) == folds  # tohumla belirlenimci


def test_crop_bounds():
    rng = np.random.default_rng(0)
    assert crop(5, 10, rng) == (0, 5)
    for _ in range(50):
        a, b = crop(100, 16, rng)
        assert b - a == 16 and 0 <= a and b <= 100


def test_shot_mask_ratio_and_limits():
    rng = np.random.default_rng(0)
    m = shot_mask(50, 0.2, rng)
    assert m.sum() == 10
    assert shot_mask(1, 0.2, rng).sum() == 0  # tek çekim: bağlam kalmaz, gizlenmez
    assert shot_mask(2, 0.9, rng).sum() == 1  # en çok n-1
    elig = np.zeros(10, bool)
    elig[[2, 3]] = True
    m = shot_mask(10, 0.5, rng, eligible=elig)
    assert m.sum() == 2 and m[2] and m[3]


def test_modality_mask_hides_only_present_modalities_of_visible_shots():
    rng = np.random.default_rng(1)
    ok = np.array([[1, 1, 0], [1, 0, 0], [1, 1, 1]], bool)
    hidden = np.array([False, False, True])
    mm = modality_mask(ok, hidden, 1.0, rng)
    assert mm[0].sum() == 1 and not mm[0, 2]  # var olan kiplerden biri
    assert mm[1].sum() == 0  # tek kipli çekimin tek kipi gizlenmez
    assert mm[2].sum() == 0  # zaten gizli çekim


def test_collate_pads_and_keeps_masks():
    a, b = seq(1, 1, 5), seq(2, 2, 3)
    hs = np.array([0, 1, 0, 0, 0], bool)
    batch = collate([(a, 0, 5, hs, np.zeros((5, 3), bool)), (b, 1, 3, np.array([1, 0], bool), np.zeros((2, 3), bool))])
    assert batch.feats.shape == (2, 5, 3, 4)
    assert batch.pad.tolist() == [[False] * 5, [False, False, True, True, True]]
    assert batch.hide_shot[0, 1] and batch.hide_shot[1, 0]
    assert torch.equal(batch.feats[1, 0], torch.from_numpy(b.feats[1]))
    assert not batch.ok[1, 2:].any()


def test_modality_means_ignore_missing_rows():
    from mediafm_mini.training import modality_means

    s = make_sequence(1, 1, {"visual": (np.array([[1.0, 0], [3.0, 0]]), np.array([True, True])),
                             "audio": (np.array([[5.0, 5], [0, 2.0]]), np.array([False, True])),
                             "text": (np.zeros((2, 2)), np.zeros(2, bool))}, None, np.zeros(1))
    m = modality_means([s], 2)
    assert m[0].tolist() == [2.0, 0.0] and m[1].tolist() == [0.0, 2.0] and m[2].tolist() == [0.0, 0.0]


def test_swap_context_only_swaps_across_titles():
    from mediafm_mini.dataset import swap_context

    a, b2, c = seq(1, 1, 3), seq(2, 1, 3), seq(3, 2, 3)
    c.tags = np.ones_like(c.tags)
    z = np.zeros((3, 3), bool)
    batch = collate([(s, 0, 3, np.zeros(3, bool), z) for s in (a, b2, c)])
    label = swap_context(batch, 1.0, np.random.default_rng(0))
    assert label.tolist() == [0.0, 0.0, 0.0]
    assert batch.tags[0].sum() == 3 and batch.tags[2].sum() == 0  # 1. başlık ↔ 2. başlık
    one = collate([(a, 0, 3, np.zeros(3, bool), z), (b2, 0, 3, np.zeros(3, bool), z)])
    assert swap_context(one, 1.0, np.random.default_rng(0)).tolist() == [1.0, 1.0]  # aynı başlık: değişmez
