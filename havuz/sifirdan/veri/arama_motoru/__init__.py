"""arama_motoru: ters dizinli tam metin arama (Türkçe çözümleme, BM25, ifade/yakınlık, öneriler).

Kullanım:
    from arama_motoru import InvertedIndex, search, did_you_mean, complete
    index = InvertedIndex()                                   # alanlar: baslik (2.0), govde (1.0)
    index.add("1", {"baslik": "Kedi", "govde": "Kedi süt içti."})
    search(index, '"süt içti" -köpek')                        # [Hit(doc_id='1', ...)]
    did_you_mean(index, "kdei")                               # 'kedi'

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .index import IndexFormatError, InvertedIndex
from .query import QueryError
from .search import Hit, bm25, complete, did_you_mean, search
from .text import Analyzer, lower_tr, upper_tr

__all__ = [
    "Analyzer",
    "Hit",
    "IndexFormatError",
    "InvertedIndex",
    "QueryError",
    "bm25",
    "complete",
    "did_you_mean",
    "lower_tr",
    "search",
    "upper_tr",
]
