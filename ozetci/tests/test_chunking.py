from ozetci.chunking import chunk_text, split_sentences


def test_split_sentences_turkish():
    s = split_sentences("Merhaba dünya. Bu ikinci cümle! Üçüncü mü? Evet.")
    assert s == ["Merhaba dünya.", "Bu ikinci cümle!", "Üçüncü mü?", "Evet."]


def test_chunk_respects_limit_and_overlap():
    paras = [f"Paragraf {i}. " + "Kelime " * 40 + "Son cümle." for i in range(12)]
    text = "\n\n".join(paras)
    chunks = chunk_text(text, max_chars=800, overlap_chars=200)
    assert len(chunks) > 1
    assert all(len(c) <= 800 for c in chunks)
    # örtüşme: bir sonraki parça öncekinin kuyruğuyla başlıyor
    assert chunks[1].startswith("… ") and "Son cümle." in chunks[1][:220]
    assert "Paragraf 2." in chunks[1]
    joined = " ".join(chunks)
    assert "Paragraf 0." in joined and "Paragraf 11." in joined


def test_short_text_single_chunk():
    assert chunk_text("kısa", max_chars=100) == ["kısa"]
    assert chunk_text("   ", max_chars=100) == []


def test_oversized_sentence_hard_split():
    text = "a" * 2500
    chunks = chunk_text(text, max_chars=1000, overlap_chars=0)
    assert len(chunks) == 3 and all(len(c) <= 1000 for c in chunks)


def test_overlap_never_exceeds_limit():
    text = "\n\n".join("Kelime " * 60 + "Son." for _ in range(10))
    for mc in (500, 450, 430):
        chunks = chunk_text(text, max_chars=mc, overlap_chars=400)
        assert all(len(c) <= mc for c in chunks)
