"""Veri hattı: derlem okuma, belge sınırları, eğitim/doğrulama ayrımı, memmap yığınları."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from dil_modeli.batches import TokenData, load_meta
from dil_modeli.corpus import CorpusOptions, expand_inputs, iter_pieces
from dil_modeli.data import TRAIN, VAL, PrepareOptions, prepare_data
from dil_modeli.tokenizer import BOS, EOS, BPETokenizer
from dil_modeli.tokenizer_train import train_bpe

from .helpers import make_corpus


def _write_jsonl(path: Path, texts: list[str]) -> Path:
    path.write_text(
        "".join(json.dumps({"text": t}, ensure_ascii=False) + "\n" for t in texts), "utf-8"
    )
    return path


def _all_tokens(data_dir: Path, split: str) -> np.ndarray:
    data = TokenData(data_dir, split)
    return (
        np.concatenate([np.asarray(shard) for shard in data.shards])
        if data.shards
        else np.array([])
    )


def test_jsonl_documents_are_wrapped_and_split_by_document(
    tokenizer: BPETokenizer, tmp_path: Path
) -> None:
    texts = make_corpus(lines=300, seed=3)
    source = _write_jsonl(tmp_path / "derlem.jsonl", texts)
    meta = prepare_data(
        [source], tokenizer, tmp_path / "veri", options=PrepareOptions(val_fraction=0.1)
    )
    assert meta["documents"] == meta["pieces"] == 300
    train, val = _all_tokens(tmp_path / "veri", TRAIN), _all_tokens(tmp_path / "veri", VAL)
    assert len(train) == meta["splits"][TRAIN]["tokens"] > len(val) > 0
    # Her belge <|bas|> ile başlar, <|son|> ile biter; belge sayısı iki bölümün toplamıdır.
    for tokens in (train, val):
        assert tokens[0] == tokenizer.bos_id
        assert tokens[-1] == tokenizer.eos_id
        assert (tokens == tokenizer.bos_id).sum() == (tokens == tokenizer.eos_id).sum()
    assert (train == tokenizer.bos_id).sum() + (val == tokenizer.bos_id).sum() == 300
    # Çözülen metin özgün belgelerin tamamını, hiçbiri iki bölüme bölünmeden içerir.
    decoded = tokenizer.decode(train, skip_special=False) + tokenizer.decode(
        val, skip_special=False
    )
    assert sorted(decoded.replace(EOS, "").split(BOS)[1:]) == sorted(texts)


def test_preparation_is_deterministic_and_seed_changes_split(
    tokenizer: BPETokenizer, tmp_path: Path
) -> None:
    source = _write_jsonl(tmp_path / "d.jsonl", make_corpus(lines=200, seed=4))
    options = PrepareOptions(val_fraction=0.1, seed=1)
    first = prepare_data([source], tokenizer, tmp_path / "a", options=options)
    second = prepare_data([source], tokenizer, tmp_path / "b", options=options)
    other = prepare_data([source], tokenizer, tmp_path / "c", options=PrepareOptions(0.1, seed=2))
    assert first == second
    assert (tmp_path / "a" / "egitim-000.bin").read_bytes() == (
        tmp_path / "b" / "egitim-000.bin"
    ).read_bytes()
    assert (tmp_path / "a" / "egitim-000.bin").read_bytes() != (
        tmp_path / "c" / "egitim-000.bin"
    ).read_bytes()
    assert first["sources"][0]["bytes"] == source.stat().st_size
    assert other["splits"][TRAIN]["tokens"] + other["splits"][VAL]["tokens"] == (
        first["splits"][TRAIN]["tokens"] + first["splits"][VAL]["tokens"]
    )


def test_big_text_file_is_streamed_in_chunks(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    text = "\n".join(make_corpus(lines=500, seed=5))
    source = tmp_path / "kitap.txt"
    source.write_text(text, "utf-8")
    corpus = CorpusOptions(chunk_chars=1000)
    pieces = list(iter_pieces([source], corpus))
    assert len(pieces) > 20
    assert "".join(p.text for p in pieces) == text  # hiçbir karakter kaybolmaz
    assert [p.first for p in pieces] == [True] + [False] * (len(pieces) - 1)
    assert [p.last for p in pieces] == [False] * (len(pieces) - 1) + [True]
    assert all(p.text.endswith("\n") for p in pieces[:-1])  # parçalar satır sonunda kesilir
    meta = prepare_data(
        [source], tokenizer, tmp_path / "veri", corpus, PrepareOptions(val_fraction=0.1)
    )
    train, val = _all_tokens(tmp_path / "veri", TRAIN), _all_tokens(tmp_path / "veri", VAL)
    assert meta["documents"] == 1
    assert (train == tokenizer.bos_id).sum() + (val == tokenizer.bos_id).sum() == 1  # tek belge
    assert len(val) > 0


def test_shards_are_split_by_token_limit(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    source = _write_jsonl(tmp_path / "d.jsonl", make_corpus(lines=100, seed=6))
    meta = prepare_data(
        [source], tokenizer, tmp_path / "veri", options=PrepareOptions(0.1, shard_tokens=500)
    )
    files = meta["splits"][TRAIN]["files"]
    assert len(files) > 2
    assert all(entry["tokens"] == 500 for entry in files[:-1])
    one = prepare_data([source], tokenizer, tmp_path / "tek", options=PrepareOptions(0.1))
    assert np.array_equal(
        _all_tokens(tmp_path / "veri", TRAIN), _all_tokens(tmp_path / "tek", TRAIN)
    )
    assert one["splits"][TRAIN]["tokens"] == meta["splits"][TRAIN]["tokens"]


def test_tiny_corpus_still_gets_validation_data(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    source = tmp_path / "kisa.txt"
    source.write_text("Korkma, sönmez bu şafaklarda yüzen al sancak. " * 20, "utf-8")
    meta = prepare_data([source], tokenizer, tmp_path / "veri")
    assert meta["pieces"] == 1
    assert meta["splits"][VAL]["tokens"] > 0
    assert meta["splits"][TRAIN]["tokens"] > meta["splits"][VAL]["tokens"]


def test_fast_encoding_gives_identical_files(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    pytest.importorskip("tokenizers")
    texts = [*make_corpus(lines=100, seed=7), "içinde <|son|> ve <|bas|> yazıları geçen belge"]
    source = _write_jsonl(tmp_path / "d.jsonl", texts)
    prepare_data([source], tokenizer, tmp_path / "saf", options=PrepareOptions(0.1))
    prepare_data([source], tokenizer, tmp_path / "hizli", options=PrepareOptions(0.1, fast=True))
    for split in (TRAIN, VAL):
        assert np.array_equal(
            _all_tokens(tmp_path / "saf", split), _all_tokens(tmp_path / "hizli", split)
        )
    # Derlemdeki "<|son|>" yazısı belge sonu kimliğine dönüşmez: belge sayısı kadar <|son|> var.
    total_eos = sum(
        (_all_tokens(tmp_path / "saf", s) == tokenizer.eos_id).sum() for s in (TRAIN, VAL)
    )
    assert total_eos == len(texts)


def test_corpus_with_special_token_text_cannot_teach_special_ids() -> None:
    """Derlemde çok geçen "<|son|>" yazısı, birleştirmelerle özel kimliğe dönüşmemeli."""
    corpus = ["bir <|son|> iki <|son|> üç <|son|> dört <|son|>"] * 50
    for fast in (False, True):
        if fast:
            pytest.importorskip("tokenizers")
        tok = train_bpe(corpus, vocab_size=330, fast=fast)
        ids = tok.encode("bir <|son|> iki")
        assert tok.eos_id not in ids
        assert tok.decode(ids) == "bir <|son|> iki"


def test_batches_are_shifted_deterministic_and_in_range(
    tokenizer: BPETokenizer, tmp_path: Path
) -> None:
    source = _write_jsonl(tmp_path / "d.jsonl", make_corpus(lines=300, seed=8))
    prepare_data(
        [source], tokenizer, tmp_path / "veri", options=PrepareOptions(0.1, shard_tokens=700)
    )
    data = TokenData(tmp_path / "veri", TRAIN)
    x, y = data.sample_batch(8, 16, np.random.default_rng(0))
    again_x, again_y = data.sample_batch(8, 16, np.random.default_rng(0))
    other_x, _ = data.sample_batch(8, 16, np.random.default_rng(1))
    assert x.shape == y.shape == (8, 16)
    assert (x[:, 1:] == y[:, :-1]).all()  # hedef, girdinin bir kaydırılmışı
    assert (x == again_x).all()
    assert (y == again_y).all()
    assert not (x == other_x).all()
    assert int(x.max()) < tokenizer.vocab_size
    val = TokenData(tmp_path / "veri", VAL)
    batches = list(val.eval_batches(4, 16))
    assert sum(len(bx) for bx, _ in batches) == sum((len(s) - 1) // 16 for s in val.shards)
    limited = list(val.eval_batches(4, 16, max_batches=2))
    assert len(limited) == 2
    assert [bx.tolist() for bx, _ in limited] == [
        bx.tolist() for bx, _ in val.eval_batches(4, 16, 2)
    ]


def test_helpful_errors(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Girdi bulunamadı"):
        expand_inputs([tmp_path / "yok.txt"])
    with pytest.raises(FileNotFoundError, match="veri-hazirla"):
        load_meta(tmp_path)
    bad = tmp_path / "bozuk.jsonl"
    bad.write_text('{"metin": "alan adı farklı"}\n', "utf-8")
    with pytest.raises(ValueError, match="--alan"):
        list(iter_pieces([bad]))
    assert [p.text for p in iter_pieces([bad], CorpusOptions(text_field="metin"))] == [
        "alan adı farklı"
    ]
    latin = tmp_path / "eski.txt"
    latin.write_bytes("çığlık ğüşiöç".encode("cp1254"))
    with pytest.raises(ValueError, match="cp1254"):
        list(iter_pieces([latin]))
    assert next(iter_pieces([latin], CorpusOptions(encoding="cp1254"))).text == "çığlık ğüşiöç"
    source = _write_jsonl(tmp_path / "d.jsonl", ["kısa metin"])
    prepare_data([source], tokenizer, tmp_path / "veri")
    with pytest.raises(ValueError, match="yetmiyor"):
        TokenData(tmp_path / "veri", TRAIN).sample_batch(2, 64, np.random.default_rng(0))
    (tmp_path / "veri" / "egitim-000.bin").write_bytes(b"\x00")
    with pytest.raises(ValueError, match="yeniden hazırlayın"):
        TokenData(tmp_path / "veri", TRAIN)


def test_line_documents_nfc_and_directory_input(tmp_path: Path) -> None:
    folder = tmp_path / "metinler"
    folder.mkdir()
    (folder / "a.txt").write_text("birinci satır\n\nikinci satır\n", "utf-8")
    (folder / "b.txt").write_text("gu\u0306zel", "utf-8")  # g + u + birleşen breve
    files = expand_inputs([folder])
    assert [f.name for f in files] == ["a.txt", "b.txt"]
    pieces = list(iter_pieces(files, CorpusOptions(line_documents=True)))
    assert [p.text for p in pieces] == ["birinci satır", "ikinci satır", "gŭzel"]
    assert all(p.first and p.last for p in pieces)
    raw = list(iter_pieces(files, CorpusOptions(line_documents=True, normalize=False)))
    assert raw[-1].text == "gu\u0306zel"
