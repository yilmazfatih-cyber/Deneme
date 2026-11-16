"""sutun_deposu: sütun tabanlı küçük analitik depo (sözlük + RLE kodlama, vektörel süzme, kümeleme).

Kullanım:
    from sutun_deposu import ColumnTable
    t = ColumnTable.from_rows(satirlar, ["sehir", "tutar"])
    t.select(where=[("tutar", ">", 100)], group_by="sehir", aggregates=[("tutar", "sum")])

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .encoding import Dictionary, Plain, RunLength, encode, encoded_size
from .table import ColumnTable, RowTable, predicate

__all__ = [
    "ColumnTable",
    "Dictionary",
    "Plain",
    "RowTable",
    "RunLength",
    "encode",
    "encoded_size",
    "predicate",
]
