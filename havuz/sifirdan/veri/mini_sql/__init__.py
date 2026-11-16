"""mini_sql: SQL alt kümesi motoru (belirteçleyici → ayrıştırıcı → plan → volcano yürütücü).

Kullanım:
    from mini_sql import Database
    db = Database()
    db.execute_script("CREATE TABLE t (id INTEGER PRIMARY KEY, ad TEXT); INSERT INTO t (ad) VALUES ('a')")
    db.query("SELECT ad, count(*) FROM t GROUP BY ad")       # [('a', 1)]
    db.query("EXPLAIN SELECT * FROM t WHERE id = ?", [1])    # plan satırları

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .engine import Database, Result
from .errors import ConstraintError, SqlError

__all__ = ["ConstraintError", "Database", "Result", "SqlError"]
