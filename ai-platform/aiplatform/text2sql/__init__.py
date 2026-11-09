"""Yalnız SQL üreten motor (Text2SQL).

Sohbet yok, serbest metin yok: soru + şema (+ ipucu) girer, **şemaya karşı doğrulanmış** tek bir SELECT çıkar.

Katmanlar:
- `schema.SchemaIndex`   — DDL, SQLite dosyası veya sözlükten tablo/sütun/anahtar/örnek-değer dizini.
- `linking.link_schema`  — soruya göre ilgili tablo ve sütunları seçer (büyük şemalarda istemi küçültür).
- `grounding.ground`     — üretilen SQL'deki HER sütunu sqlglot ile şemaya bağlar; olmayan sütun = ret + öneri.
- `pipeline.Text2SQL`    — üret → güvenlik denetimi → sütun bağlama → (çalıştır) → hatayla düzelt → aday oylaması.
- `bird`                 — BIRD veri kümesinde yürütme doğruluğu (execution accuracy) ölçer, tahmin dosyası yazar.

Ağırlıkların kendisi `scripts/text2sql/` altındaki LoRA eğitimi ve ağırlık-uzayı birleştirme betikleriyle üretilir;
bu paket o ağırlıkları (veya herhangi bir OpenAI uyumlu modeli) çalıştırır ve çıktısını denetler.
"""

from .grounding import GroundingError, ground
from .linking import link_schema
from .pipeline import Text2SQL, Text2SQLResult
from .schema import SchemaIndex

__all__ = ["GroundingError", "SchemaIndex", "Text2SQL", "Text2SQLResult", "ground", "link_schema"]
