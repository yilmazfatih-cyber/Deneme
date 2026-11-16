"""Veri hattı iskeleti: nazik HTTP getirici, aşamalı hat (çek → doğrula → dönüştür → yükle),
idempotent/artımlı yükleme, koşu günlüğü, hata karantinası ve depolar (CSV, JSONL, SQLite, DuckDB).

Örnek hat: ``examples/tcmb.py`` (TCMB günlük döviz kurları). Kayıt: ``registry.py``.
Genişletme: AGENTS.md → "Yeni hat ekle".
"""
