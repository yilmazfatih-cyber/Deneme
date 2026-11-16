"""Arama motoru: Türkçe çözümleme, BM25 (elle hesaplanmış örnek), ifade/yakınlık, alanlar,
öneriler, kayıt."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from arama_motoru import (
    Analyzer,
    Hit,
    IndexFormatError,
    InvertedIndex,
    QueryError,
    complete,
    did_you_mean,
    lower_tr,
    search,
    upper_tr,
)
from arama_motoru.__main__ import main as cli_main
from arama_motoru.spelling import edit_distance

DOCS = {
    "kedi": {"baslik": "Kediler ve süt", "govde": "Küçük kedi süt içti. Kediler sütü çok sever."},
    "kopek": {"baslik": "Köpek", "govde": "Köpek kemik sever, kedi ile oynar."},
    "sehir": {
        "baslik": "İstanbul'da kitaplar",
        "govde": "Kitapları okudu; İSTANBUL IŞIK saçar. Ev ve araba aldı, Ankara'ya gitti.",
    },
}


@pytest.fixture
def index() -> InvertedIndex:
    built = InvertedIndex()
    for doc_id, fields in DOCS.items():
        built.add(doc_id, fields)
    return built


def ids(hits: list[Hit]) -> list[str]:
    return [hit.doc_id for hit in hits]


def test_turkish_case_and_tokens() -> None:
    assert lower_tr("İSTANBUL IŞIK İzmir") == "istanbul ışık izmir"
    assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"
    tokens = Analyzer().tokens("Ev ve Araba, İstanbul'dan geldi")
    assert [(t.word, t.position) for t in tokens] == [
        ("ev", 0),
        ("araba", 2),  # "ve" durak sözcük: atıldı ama konum sayıldı
        ("istanbul", 3),  # kesme işaretinden sonrası atıldı
        ("geldi", 4),
    ]
    assert tokens[2].start == 13 and tokens[2].end == 25  # vurgulamada "İstanbul'dan"ın tamamı
    stem = Analyzer().stem
    assert {stem(w) for w in ("kitap", "kitaplar", "kitapları", "kitaplardan")} == {"kitap"}
    assert stem("kedi") == "kedi" and stem("kediler") == "kedi" and stem("evde") == "ev"
    assert Analyzer(mode="ngram").terms_of("kitap") == ("kit", "ita", "tap")


def test_bm25_matches_hand_calculation() -> None:
    corpus = InvertedIndex(fields={"govde": 1.0})
    corpus.add("d1", {"govde": "elma armut elma"})  # uzunluk 3
    corpus.add("d2", {"govde": "armut kiraz"})  # uzunluk 2
    corpus.add("d3", {"govde": "kiraz kiraz kiraz muz"})  # uzunluk 4 → ortalama 3
    # "elma": N=3, n=1 → idf = ln(1 + 2.5/1.5) = ln(8/3) ≈ 0.980829
    # d1: tf=2, |d|/ort = 1 → 0.980829 · 2 · 2.2 / (2 + 1.2) ≈ 1.348640
    (hit,) = search(corpus, "elma")
    assert hit.doc_id == "d1" and hit.score == pytest.approx(1.348640, abs=1e-6)
    assert math.log(8 / 3) * 2 * 2.2 / 3.2 == pytest.approx(1.348640, abs=1e-6)
    # "armut": n=2 → idf = ln(1 + 1.5/2.5) = ln 1.6 ≈ 0.470004
    # d1: tf=1, norm=1    → 0.470004 · 2.2 / 2.2 ≈ 0.470004
    # d2: tf=1, norm=0.75 → 0.470004 · 2.2 / (1 + 0.9) ≈ 0.544215  (kısa belge öne geçer)
    first, second = search(corpus, "armut")
    assert (first.doc_id, second.doc_id) == ("d2", "d1")
    assert first.score == pytest.approx(0.544215, abs=1e-6)
    assert second.score == pytest.approx(0.470004, abs=1e-6)


def test_query_operators(index: InvertedIndex) -> None:
    assert ids(search(index, "kedi")) == ["kedi", "kopek"]  # başlıkta da geçen öne çıkar
    assert ids(search(index, "kedi süt")) == ["kedi"]  # varsayılan VE
    assert ids(search(index, "kedi kemik", any_term=True)) == ["kedi", "kopek"]
    assert ids(search(index, '"süt içti"')) == ["kedi"]
    assert ids(search(index, '"içti süt"')) == []  # sıra yanlış
    assert ids(search(index, '"içti süt"~1')) == ["kedi"]  # yakınlık sırayı önemsemez
    assert ids(search(index, '"ev ve araba"')) == ["sehir"]  # durak sözcük boşluğu korunur
    assert ids(search(index, '"ev araba"')) == []  # aradaki "ve" yüzünden yan yana değiller
    assert ids(search(index, "baslik:kedi")) == ["kedi"]
    assert ids(search(index, "govde:kemik -baslik:köpek")) == []
    assert ids(search(index, "kit*")) == ["sehir"]
    assert ids(search(index, "kedi -köpek")) == ["kedi"]
    assert ids(search(index, "İSTANBUL ışık")) == ["sehir"]
    assert ids(search(index, "-kedi")) == []
    with pytest.raises(QueryError, match="Alanlar"):
        search(index, "yazar:ahmet")


def test_snippets_highlight_and_escape_html() -> None:
    corpus = InvertedIndex()
    long_text = (
        " ".join(["dolgu"] * 50) + " burada <script>önemli</script> sözcük var " + "son " * 40
    )
    corpus.add("1", {"govde": long_text})
    (hit,) = search(corpus, "önemli", marks=("<mark>", "</mark>"), as_html=True)
    assert "<mark>önemli</mark>" in hit.snippet
    assert "&lt;script&gt;" in hit.snippet and "<script>" not in hit.snippet
    assert hit.snippet.startswith("…") and hit.snippet.endswith("…")
    assert len(hit.snippet.split()) < 40


def test_suggestions(index: InvertedIndex) -> None:
    assert did_you_mean(index, "kdei süt") == "kedi süt"  # yan yana harf yer değiştirmesi
    assert did_you_mean(index, "kitpa") == "kitaplar"  # köke yakın → en sık yüzey biçimi
    assert did_you_mean(index, "kedi") is None
    assert complete(index, "ked") == ["kedi", "kediler"]
    assert complete(index, "Kİ") == ["kitaplar", "kitapları"]


def test_save_load_remove_and_update(index: InvertedIndex, tmp_path: Path) -> None:
    path = tmp_path / "dizin.json.gz"
    index.save(path)
    loaded = InvertedIndex.load(path)
    for query in ("kedi", '"süt içti"', "kit*", "ankara"):
        assert [(h.doc_id, h.score) for h in search(loaded, query)] == [
            (h.doc_id, h.score) for h in search(index, query)
        ]
    loaded.remove("kedi")
    assert ids(search(loaded, "süt")) == []
    loaded.add("kopek", {"govde": "Artık süt içiyor."})  # aynı kimlik: güncelleme
    assert ids(search(loaded, "kemik")) == [] and ids(search(loaded, "süt")) == ["kopek"]
    path.write_bytes(b"bozuk")
    with pytest.raises(IndexFormatError):
        InvertedIndex.load(path)


def test_ngram_mode_finds_substrings() -> None:
    corpus = InvertedIndex(Analyzer(mode="ngram"))
    corpus.add("1", {"govde": "Elektrikli süpürge"})
    corpus.add("2", {"govde": "Elektrik faturası"})
    assert ids(search(corpus, "elektrik")) == ["1", "2"] or ids(search(corpus, "elektrik")) == [
        "2",
        "1",
    ]
    assert ids(search(corpus, "trikli")) == ["1"]  # sözcük içinden


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "belgeler.jsonl"
    lines = [json.dumps({"id": key, **fields}, ensure_ascii=False) for key, fields in DOCS.items()]
    source.write_text("\n".join(lines), encoding="utf-8")
    index_path = tmp_path / "d.json.gz"
    assert cli_main(["dizinle", str(source), str(index_path)]) == 0
    assert cli_main(["ara", str(index_path), '"süt içti"']) == 0
    assert "[süt] [içti]" in capsys.readouterr().out
    assert cli_main(["ara", str(index_path), "kdei"]) == 1
    assert "Bunu mu demek istediniz: kedi" in capsys.readouterr().err
    assert cli_main(["tamamla", str(index_path), "kit"]) == 0


def _reference_osa(a: str, b: str) -> int:
    """Erken kesmesiz, düz tablo: başvuru gerçekleme."""
    table = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        table[i][0] = i
    for j in range(len(b) + 1):
        table[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            table[i][j] = min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                table[i][j] = min(table[i][j], table[i - 2][j - 2] + 1)
    return table[-1][-1]


@given(st.text("abcı", max_size=7), st.text("abcı", max_size=7), st.integers(0, 3))
def test_edit_distance_matches_reference(a: str, b: str, limit: int) -> None:
    expected = _reference_osa(a, b)
    assert edit_distance(a, b) == expected
    assert edit_distance(a, b, limit) == (expected if expected <= limit else limit + 1)


def _brute_force_phrase(text: str, phrase: str) -> bool:
    """Belgelenen anlam: durak sözcükler dizinde yok, ifadede JOKER sayılır (yalnız boşluk korunur);
    baştaki/sondaki durak sözcükler düşer."""
    words, stop = text.split(), {"ve", "bir"}
    wanted = phrase.split()
    while wanted and wanted[0] in stop:
        wanted.pop(0)
    while wanted and wanted[-1] in stop:
        wanted.pop()
    return any(
        all(w in stop or words[p + i] == w for i, w in enumerate(wanted))
        for p in range(len(words) - len(wanted) + 1)
    )


def test_random_documents_phrase_search_agrees_with_brute_force() -> None:
    rng = random.Random(4)
    vocabulary = ["elma", "armut", "kiraz", "muz", "ve", "bir", "erik", "ayva"]
    corpus = InvertedIndex(fields={"govde": 1.0})
    texts = {str(n): " ".join(rng.choice(vocabulary) for _ in range(12)) for n in range(40)}
    for doc_id, text in texts.items():
        corpus.add(doc_id, {"govde": text})
    checked = 0
    for _ in range(80):
        phrase = " ".join(rng.choice(vocabulary) for _ in range(rng.randint(2, 4)))
        if all(word in {"ve", "bir"} for word in phrase.split()):
            continue  # yalnız durak sözcüklü ifade sorgusu boştur
        expected = {d for d, text in texts.items() if _brute_force_phrase(text, phrase)}
        assert set(ids(search(corpus, f'"{phrase}"', limit=100))) == expected, phrase
        checked += 1
    assert checked > 60
