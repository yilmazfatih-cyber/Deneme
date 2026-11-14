import numpy as np
import torch

from mediafm_mini.context import TagLayout
from mediafm_mini.dataset import collate, make_sequence
from mediafm_mini.model import MediaFMMini, ModelConfig, msm_loss, window_starts, window_weights


def tiny_layout() -> TagLayout:
    return TagLayout(["siddet", "mizah"], ["komik"], ["mekan:uzay"], ["animasyon"], ["duygusal"])


def test_tag_layout_vector():
    L = tiny_layout()
    ctx = {"type": "SHOW", "genres": ["animasyon", "bilinmeyen"], "moods": [],
           "tags": {"basis": "MODEL", "scales": {"siddet": 5, "mizah": 0}, "descriptors": ["komik"],
                    "facets": {"mekan": ["uzay"]}}}
    v = L.vector(ctx)
    ix = {n: i for i, n in enumerate(L.names)}
    assert v[ix["scale:siddet"]] == 1.0 and v[ix["scale?:siddet"]] == 1.0
    assert v[ix["scale:mizah"]] == 0.0 and v[ix["scale?:mizah"]] == 1.0  # 0 değeri "yok"tan ayrılır
    assert v[ix["desc:komik"]] == 1 and v[ix["facet:mekan:uzay"]] == 1 and v[ix["genre:animasyon"]] == 1
    assert v[ix["basis:MODEL"]] == 1 and v[ix["type:SHOW"]] == 1
    assert v.sum() == 8  # bilinmeyen tür sessizce atlanır
    assert TagLayout.from_json(L.to_json()).names == L.names


def test_tag_layout_from_repo_matches_vocabulary():
    L = TagLayout.from_repo()
    assert "scale:siddet" in L.names and "genre:animasyon" in L.names and "mood:duygusal" in L.names
    assert len(set(L.names)) == L.dim


def _batch(n=6, D=8, T=9, hide=(1,)):
    rng = np.random.default_rng(0)
    mods = {m: (rng.normal(size=(n, D)).astype(np.float32), np.ones(n, bool)) for m in ("visual", "audio", "text")}
    s = make_sequence(1, 1, mods, rng.normal(size=D).astype(np.float32), np.zeros(T, np.float32))
    hs = np.zeros(n, bool)
    hs[list(hide)] = True
    return s, collate([(s, 0, n, hs, np.zeros((n, 3), bool))])


def test_forward_shapes_loss_and_masking_hides_input():
    s, b = _batch()
    torch.manual_seed(0)
    m = MediaFMMini(ModelConfig(in_dim=8, tag_dim=9, d=16, layers=1, heads=2, ff=32, dropout=0.0))
    h, pred = m(b)
    assert h.shape == (1, 6, 16) and pred.shape == (1, 6, 3, 8)
    loss, st = msm_loss(pred, b)
    assert st["n_shot"] == 3 and torch.isfinite(loss)
    # gizli çekimin girdisini değiştirmek çıktıyı değiştirmemeli (model onu görmüyor)
    b2 = collate([(s, 0, 6, b.hide_shot[0].numpy(), np.zeros((6, 3), bool))])
    b2.feats[0, 1] = torch.randn_like(b2.feats[0, 1]) * 10
    m.eval()
    assert torch.allclose(m(b)[0], m(b2)[0], atol=1e-5)


def test_global_token_changes_output_only_when_used():
    _, b = _batch()
    torch.manual_seed(0)
    m = MediaFMMini(ModelConfig(in_dim=8, tag_dim=9, d=16, layers=1, heads=2, ff=32, dropout=0.0)).eval()
    h1 = m(b)[0]
    b.tags = b.tags + 1.0
    assert not torch.allclose(h1, m(b)[0])
    torch.manual_seed(0)
    m2 = MediaFMMini(ModelConfig(in_dim=8, tag_dim=9, d=16, layers=1, heads=2, ff=32, dropout=0.0,
                                 use_global=False)).eval()
    h2 = m2(b)[0]
    b.tags = b.tags - 1.0
    assert torch.allclose(h2, m2(b)[0])


def test_windows_cover_sequence():
    assert window_starts(10, 64, 32) == [0]
    st = window_starts(150, 64, 32)
    assert st[0] == 0 and st[-1] == 86
    covered = set()
    for a in st:
        covered |= set(range(a, a + 64))
    assert covered == set(range(150))
    w = window_weights(64)
    assert w[32] > w[0] and torch.all(w > 0)
