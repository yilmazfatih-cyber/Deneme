from datetime import date

from legalai.chunking import chunk_document
from legalai.db import Database, build_fts_query
from legalai.embeddings import HashEmbedder
from legalai.models import SourceId
from legalai.retrieval import Retriever
from legalai.text import fold_tr, parse_tr_date, tr_lower


def test_text_helpers():
    assert tr_lower("İSTANBUL ILICA") == "istanbul ılıca"
    assert fold_tr("Şişli Çağlayan Üsküdar") == "sisli caglayan uskudar"
    assert parse_tr_date("31.10.2025") == date(2025, 10, 31)
    assert parse_tr_date("31 Ekim 2025") == date(2025, 10, 31)
    assert parse_tr_date("20251031") == date(2025, 10, 31)
    assert parse_tr_date("2025-10-31") == date(2025, 10, 31)
    assert parse_tr_date("yok") is None


def test_chunking_is_madde_aware(tbk_doc):
    chunks = chunk_document(tbk_doc)
    headings = [c.heading for c in chunks]
    assert "Madde 344" in headings
    m344 = next(c for c in chunks if c.heading == "Madde 344")
    assert m344.anchor == "madde-344"
    assert "tüketici fiyat endeksi" in m344.text
    # Parçalar belgeyi kaplar ve sıralıdır
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert all(tbk_doc.text[c.char_start : c.char_end].strip() == c.text for c in chunks)


def test_chunking_court_sections(karar_doc):
    chunks = chunk_document(karar_doc)
    assert {"Gerekçe", "Hüküm", "Dava"} <= {c.heading for c in chunks}


def test_fts_query_builder():
    q = build_fts_query('kira artışı "tüketici fiyat endeksi" ve')
    assert '"tuketici fiyat endeksi"' in q
    assert "kira*" in q and "artisi*" in q
    assert " ve" not in q.replace('"tuketici fiyat endeksi"', "")
    assert build_fts_query("") == ""


def test_db_roundtrip_and_search(db: Database, tbk_doc):
    assert db.stats()["documents"] == 2
    got = db.get_document(tbk_doc.doc_id)
    assert got is not None and got.law_no == "6098"
    hits = db.fts_search("kira bedeli artış oranı TÜFE")
    assert hits, "BM25 sonuç vermeli"
    ids = [cid for cid, _ in hits]
    assert any("mevzuat:1.5.6098" in cid for cid in ids)
    assert any("yargitay:abc123" in cid for cid in ids)
    # Kaynak filtresi
    only_court = db.fts_search("kira", sources=[SourceId.YARGITAY])
    assert all(cid.startswith("yargitay:") for cid, _ in only_court)
    # Tarih filtresi (karar 2023, kanun 2011)
    recent = db.fts_search("kira", since=date(2020, 1, 1))
    assert all(cid.startswith("yargitay:") for cid, _ in recent)


def test_upsert_replaces_chunks(db: Database, tbk_doc):
    before = db.stats()["chunks"]
    db.upsert_document(tbk_doc, chunk_document(tbk_doc))
    assert db.stats()["chunks"] == before
    assert db.has_document(tbk_doc.doc_id, tbk_doc.content_hash)
    assert not db.has_document(tbk_doc.doc_id, "farkli")


def test_retriever_hybrid(db: Database):
    emb = HashEmbedder()
    for batch in db.iter_chunks_without_embedding(emb.model_name):
        db.put_embeddings(
            emb.model_name, zip([c.chunk_id for c in batch], emb.embed_documents([c.text for c in batch]))
        )
    r = Retriever(db, emb, per_doc=2)
    hits = r.search("kira artış oranı tüketici fiyat endeksi", k=5)
    assert hits and hits[0].vector_rank is not None and hits[0].bm25_rank is not None
    assert hits[0].link.startswith("https://")
    # Belge başına sınır
    from collections import Counter

    assert max(Counter(h.document.doc_id for h in hits).values()) <= 2
    # Madde bağlantısı çıpa taşır
    m = next((h for h in hits if h.chunk.heading == "Madde 344"), None)
    assert m is not None and m.link.endswith("#madde-344")
