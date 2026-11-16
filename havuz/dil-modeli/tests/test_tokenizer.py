"""BPE tokenizer'ın temel güvenceleri: gidiş-dönüş, özel belirteçler, belirlenimcilik, kayıt."""

from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

from dil_modeli.bytelevel import BYTE_TO_CHAR, from_bytelevel, pretokenize, to_bytelevel
from dil_modeli.tokenizer import BOS, DEFAULT_SPECIAL_TOKENS, EOS, BPETokenizer, StreamDecoder
from dil_modeli.tokenizer_api import load_tokenizer
from dil_modeli.tokenizer_char import UNKNOWN, CharTokenizer
from dil_modeli.tokenizer_train import train_bpe

from .helpers import random_text

SAMPLES = [
    "",
    " ",
    "Iğdır'dan İzmir'e, Çanakkale'ye; öğle üzeri şöyle güzel bir yolculuk.",
    "ıİiI ğĞ üÜ şŞ öÖ çÇ âîû",
    "Emoji: 🙂 🇹🇷 👨‍👩‍👧 ve birleşen işaret: é ẋ",
    "karışık   boşluk\t\tsekme\r\nsatır\n\n\nson  ",
    " bölünmez boşluk satır ayırıcı​sıfır genişlik",
    "1.250,75 TL %18 08:30 2024-11-16 3,14",
    "日本語 العربية Ελληνικά кириллица",
    "a" * 300 + " " + "ab" * 200,
]


def test_bytelevel_table_matches_gpt2() -> None:
    assert len(set(BYTE_TO_CHAR)) == 256
    assert BYTE_TO_CHAR[ord(" ")] == "Ġ"
    assert BYTE_TO_CHAR[ord("\n")] == "Ċ"
    assert BYTE_TO_CHAR[ord("a")] == "a"
    assert from_bytelevel(to_bytelevel("çğış 🙂")) == "çğış 🙂".encode()


@pytest.mark.parametrize("text", SAMPLES)
def test_pretokenize_is_lossless(text: str) -> None:
    assert "".join(pretokenize(text)) == text


@pytest.mark.parametrize("text", SAMPLES)
def test_round_trip(tokenizer: BPETokenizer, text: str) -> None:
    ids = tokenizer.encode(text)
    assert tokenizer.decode(ids) == text
    assert all(0 <= i < tokenizer.vocab_size for i in ids)


def test_round_trip_random(tokenizer: BPETokenizer) -> None:
    rng = random.Random(1)
    for _ in range(500):
        text = random_text(rng)
        assert tokenizer.decode(tokenizer.encode(text)) == text
        ids = tokenizer.encode(text, allow_special=True)
        assert tokenizer.decode(ids, skip_special=False) == text


def test_special_tokens_are_single_ids_only_when_allowed(tokenizer: BPETokenizer) -> None:
    text = f"{BOS}Merhaba{EOS}"
    allowed = tokenizer.encode(text, allow_special=True)
    assert allowed[0] == tokenizer.bos_id
    assert allowed[-1] == tokenizer.eos_id
    assert allowed.count(tokenizer.bos_id) == 1
    # Güvenli varsayılan: aynı yazı sıradan metin olarak kodlanır, özel kimlik üretmez.
    plain = tokenizer.encode(text)
    assert not any(tokenizer.is_special(i) for i in plain)
    assert tokenizer.decode(plain) == text


def test_every_default_special_token_exists(tokenizer: BPETokenizer) -> None:
    for index, name in enumerate(DEFAULT_SPECIAL_TOKENS):
        assert tokenizer.special_id(name) == index
        assert tokenizer.encode(name, allow_special=True) == [index]


def test_decode_skips_or_shows_special(tokenizer: BPETokenizer) -> None:
    ids = [tokenizer.bos_id, *tokenizer.encode("selam"), tokenizer.eos_id]
    assert tokenizer.decode(ids) == "selam"
    assert tokenizer.decode(ids, skip_special=False) == f"{BOS}selam{EOS}"


def test_training_and_encoding_are_deterministic(corpus: list[str]) -> None:
    first = train_bpe(corpus, vocab_size=400)
    second = train_bpe(list(reversed(corpus)), vocab_size=400)  # sıra sonucu değiştirmemeli
    assert first.to_json() == second.to_json()
    assert first.fingerprint() == second.fingerprint()
    assert first.encode("milletimin yıldızı") == second.encode("milletimin yıldızı")


def test_save_and_load(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    path = tmp_path / "tokenizer.json"
    tokenizer.save(path)
    loaded = load_tokenizer(path)
    assert isinstance(loaded, BPETokenizer)
    assert loaded.fingerprint() == tokenizer.fingerprint()
    assert loaded.encode("Çatma, kurban olayım") == tokenizer.encode("Çatma, kurban olayım")
    assert load_tokenizer(tmp_path).vocab_size == tokenizer.vocab_size  # klasör de verilebilir


def test_load_accepts_old_merge_format_and_bos_template(tokenizer: BPETokenizer) -> None:
    data = tokenizer.to_json(add_bos=True)
    data["model"]["merges"] = [" ".join(pair) for pair in data["model"]["merges"]]
    assert BPETokenizer.from_json(data).fingerprint() == tokenizer.fingerprint()


def test_load_rejects_settings_outside_the_subset(tokenizer: BPETokenizer) -> None:
    for patch in (
        {"normalizer": {"type": "NFC"}},
        {"pre_tokenizer": {"type": "Whitespace"}},
        {"pre_tokenizer": {"type": "ByteLevel", "add_prefix_space": True, "use_regex": True}},
        {"decoder": {"type": "WordPiece"}},
    ):
        data = {**tokenizer.to_json(), **patch}
        with pytest.raises(ValueError, match="alt kümenin dışında"):
            BPETokenizer.from_json(data)
    with pytest.raises(FileNotFoundError, match="tokenizer-egit"):
        load_tokenizer("yok/tokenizer.json")


def test_special_token_names_must_be_ascii(tokenizer: BPETokenizer) -> None:
    vocab = tokenizer.vocab
    vocab["<|kullanıcı|>"] = len(vocab)
    with pytest.raises(ValueError, match="ASCII"):
        BPETokenizer(vocab, tokenizer.merges, ["<|kullanıcı|>"])


def test_vocab_must_contain_all_bytes(tokenizer: BPETokenizer) -> None:
    vocab = {token: i for i, token in enumerate(["a", "b"])}
    with pytest.raises(ValueError, match="bayt belirteci eksik"):
        BPETokenizer(vocab, [], [])
    with pytest.raises(ValueError, match="sözlük dışında"):
        tokenizer.decode([tokenizer.vocab_size])


def test_lone_surrogate_does_not_crash(tokenizer: BPETokenizer) -> None:
    assert tokenizer.decode(tokenizer.encode("a\ud800b")) == "a�b"


def test_stream_decoder_matches_one_shot_decode(tokenizer: BPETokenizer) -> None:
    rng = random.Random(2)
    texts = ["Merhaba 🙂 dünya 🇹🇷!", "ığüşöç", *[random_text(rng) for _ in range(100)]]
    for text in texts:
        ids = tokenizer.encode(text)
        decoder = StreamDecoder(tokenizer)
        pieces = [decoder.push(i) for i in ids]
        pieces.append(decoder.flush())
        assert "".join(pieces) == text
    # Geçersiz bayt dizileri: akış ve tek seferde çözme aynı U+FFFD'leri üretmeli.
    for _ in range(200):
        ids = [rng.randrange(tokenizer.vocab_size) for _ in range(rng.randint(1, 12))]
        decoder = StreamDecoder(tokenizer, skip_special=False)
        streamed = "".join([*(decoder.push(i) for i in ids), decoder.flush()])
        assert streamed == tokenizer.decode(ids, skip_special=False)


def test_stream_decoder_holds_back_incomplete_character(tokenizer: BPETokenizer) -> None:
    ids = tokenizer.encode("🙂")
    assert len(ids) > 1  # küçük sözlükte emoji birkaç bayt belirtecine bölünür
    decoder = StreamDecoder(tokenizer)
    pieces = [decoder.push(i) for i in ids]
    assert pieces[:-1] == [""] * (len(ids) - 1)
    assert pieces[-1] == "🙂"


def test_min_frequency_stops_training_early() -> None:
    small = train_bpe(["aaa bbb"], vocab_size=1000, min_frequency=2)
    assert small.vocab_size < 1000
    with pytest.raises(ValueError, match="Sözlük boyutu en az"):
        train_bpe(["abc"], vocab_size=100)


def test_char_tokenizer(tmp_path: Path) -> None:
    tok = CharTokenizer.train(["ığüşöç abc", "İstanbul"])
    text = "İstanbul ığüş"
    assert tok.decode(tok.encode(text)) == text
    assert tok.encode("Q") == [tok.special_id(UNKNOWN)]
    assert tok.encode(f"{BOS}a", allow_special=True)[0] == tok.bos_id
    assert tok.encode(f"{BOS}a")[0] != tok.bos_id
    path = tmp_path / "tokenizer.json"
    tok.save(path)
    loaded = load_tokenizer(path)
    assert isinstance(loaded, CharTokenizer)
    assert loaded.fingerprint() == tok.fingerprint()
    assert json.loads(path.read_text(encoding="utf-8"))["tur"] == "karakter"
