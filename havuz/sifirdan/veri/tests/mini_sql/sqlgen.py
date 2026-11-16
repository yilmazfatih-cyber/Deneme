"""Farksal test için rastgele SQL üreteci (şema + veri + dizin + sorgu + değiştiren deyim).

Üretilen her şey mini_sql'in desteklediği alt kümededir ve tür olarak tutarlıdır (sayı sayıyla, metin
metinle karşılaştırılır; böylece SQLite'ın karşılaştırmadaki tür yakınlığı dönüşümü devreye girmez).
ORDER BY varsa çıktı sütunlarının HEPSİNE göre sıralanır: sıra tam belirlidir, liste aynen karşılaştırılır.
Kümeleme argümanlarında `/` yoktur: SQLite REAL toplamında Kahan toplaması kullanır; argümanlar tam
değerli (k/4) kalınca toplama sırası sonucu değiştirmez.

Genişletme: yeni bir SQL özelliğini farksal teste katmak için ilgili `_num`/`_text`/`_bool` dalına
olasılıklı bir seçenek ekleyin; önce sqlite3'ün aynı sorguyu kabul ettiğini görün.
"""

from __future__ import annotations

import random

TABLES: dict[str, list[tuple[str, str]]] = {
    "t1": [("id", "INTEGER PRIMARY KEY"), ("a", "INTEGER"), ("b", "TEXT"), ("c", "REAL")],
    "t2": [("id", "INTEGER PRIMARY KEY"), ("x", "INTEGER"), ("y", "TEXT"), ("t1_id", "INTEGER")],
    "t3": [("id", "INTEGER PRIMARY KEY"), ("k", "INTEGER"), ("v", "TEXT")],
}
WORDS = ["ılık", "İzmir", "şeker", "Çay", "abc", "ABC", "", "a%b", "x_y", "Ab", "ab", "Iğdır", "z"]
PATTERNS = ["a%", "%b%", "_b%", "İ%", "ı%", "%", "A_", "%r", "x\\_%", "ab"]


def literal(value: int | float | str | None) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return repr(value)


class SqlGen:
    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.sources: list[tuple[str, str]] = []  # (takma ad, tablo) — o anki FROM
        self.indexed: set[tuple[str, str]] = set()  # (tablo, sütun): dizini olanlar

    # ── Şema ve veri ────────────────────────────────────────────────────────────────────────────

    def schema(self) -> list[str]:
        statements = []
        for name, columns in TABLES.items():
            body = ", ".join(f"{column} {kind}" for column, kind in columns)
            statements.append(f"CREATE TABLE {name} ({body})")
            for column, _ in columns[1:]:
                if self.rng.random() < 0.4:
                    statements.append(f"CREATE INDEX ix_{name}_{column} ON {name} ({column})")
                    self.indexed.add((name, column))
        return statements

    def value_for(self, column: str) -> int | float | str | None:
        rng = self.rng
        if rng.random() < 0.2:
            return None
        if column in ("b", "y", "v"):
            return rng.choice(WORDS)
        if column == "c":
            return rng.randint(-8, 8) / 4
        if column == "t1_id":
            return rng.randint(1, 8)
        return rng.randint(-3, 5)

    def inserts(self) -> list[str]:
        statements = []
        for name, columns in TABLES.items():
            for _ in range(self.rng.randint(0, 12)):
                names = [column for column, _ in columns[1:]]
                values = ", ".join(literal(self.value_for(column)) for column in names)
                statements.append(f"INSERT INTO {name} ({', '.join(names)}) VALUES ({values})")
        return statements

    # ── Sütun seçimi ────────────────────────────────────────────────────────────────────────────

    def _column(self, kind: str) -> str | None:
        options = [
            f"{alias}.{column}"
            for alias, table in self.sources
            for column, decl in TABLES[table]
            if (kind == "text") == ("TEXT" in decl)
        ]
        return self.rng.choice(options) if options else None

    # ── İfadeler ────────────────────────────────────────────────────────────────────────────────

    def num(self, depth: int = 2, exact: bool = False) -> str:
        rng = self.rng
        roll = rng.random()
        column = self._column("num")
        if depth <= 0 or roll < 0.35:
            if column is not None and rng.random() < 0.75:
                return column
            choices: list[int | float | None] = [rng.randint(-3, 5), rng.randint(-8, 8) / 4, None]
            return literal(rng.choice(choices))
        if roll < 0.65:
            ops = ["+", "-", "*"] + ([] if exact else ["/", "%"])
            return f"({self.num(depth - 1, exact)} {rng.choice(ops)} {self.num(depth - 1, exact)})"
        if roll < 0.72:
            return f"(- {self.num(depth - 1, exact)})"  # "--" yorum başlatır: boşluk şart
        if roll < 0.78:
            return f"abs({self.num(depth - 1, exact)})"
        if roll < 0.84:
            return f"length({self.text(depth - 1)})"
        if roll < 0.9:
            fn = rng.choice(["coalesce", "ifnull", "nullif"])
            return f"{fn}({self.num(depth - 1, exact)}, {self.num(depth - 1, exact)})"
        if roll < 0.95:
            return f"({self.boolean(depth - 1)})"  # doğruluk değeri sayı olarak (1/0/NULL)
        return (
            f"CASE WHEN {self.boolean(depth - 1)} THEN {self.num(depth - 1, exact)} "
            f"ELSE {self.num(depth - 1, exact)} END"
        )

    def text(self, depth: int = 2) -> str:
        rng = self.rng
        roll = rng.random()
        column = self._column("text")
        if depth <= 0 or roll < 0.45:
            if column is not None and rng.random() < 0.75:
                return column
            return literal(rng.choice([*WORDS, None]))
        if roll < 0.6:
            return f"{rng.choice(['lower', 'upper'])}({self.text(depth - 1)})"
        if roll < 0.72:
            return f"({self.text(depth - 1)} || {self.text(depth - 1)})"
        if roll < 0.82:
            start, length = rng.randint(-3, 4), rng.randint(-2, 4)
            return f"substr({self.text(depth - 1)}, {start}, {length})"
        if roll < 0.92:
            fn = rng.choice(["coalesce", "ifnull", "nullif"])
            return f"{fn}({self.text(depth - 1)}, {self.text(depth - 1)})"
        return f"CASE {self.num(depth - 1)} WHEN 1 THEN {self.text(depth - 1)} ELSE {self.text(0)} END"

    def boolean(self, depth: int = 2) -> str:
        rng = self.rng
        roll = rng.random()
        if depth <= 0 or roll < 0.4:
            if rng.random() < 0.7:
                op = rng.choice(["=", "<>", "<", "<=", ">", ">=", "IS", "IS NOT"])
                return f"{self.num(1)} {op} {self.num(1)}"
            op = rng.choice(["=", "<>", "<", ">="])
            return f"{self.text(1)} {op} {self.text(1)}"
        if roll < 0.55:
            joiner = rng.choice(["AND", "OR"])
            return f"({self.boolean(depth - 1)}) {joiner} ({self.boolean(depth - 1)})"
        if roll < 0.62:
            return f"NOT ({self.boolean(depth - 1)})"
        if roll < 0.72:
            target = self.num(1) if rng.random() < 0.6 else self.text(1)
            return f"{target} IS {rng.choice(['', 'NOT '])}NULL"
        if roll < 0.8:
            negated = rng.choice(["", "NOT "])
            return f"{self.num(1)} {negated}BETWEEN {self.num(1)} AND {self.num(1)}"
        if roll < 0.9:
            items = [literal(rng.choice([rng.randint(-3, 5), 0.5, None])) for _ in range(3)]
            return f"{self.num(1)} {rng.choice(['', 'NOT '])}IN ({', '.join(items)})"
        pattern = literal(rng.choice(PATTERNS))
        return f"{self.text(1)} {rng.choice(['', 'NOT '])}LIKE {pattern}"

    def where(self) -> str:
        """WHERE koşulu; yarı olasılıkla dizine uygun bir parça içerir (`sütun op sabit` ...)."""
        rng = self.rng
        if rng.random() < 0.5:
            return self.boolean(2)
        indexed = [
            f"{alias}.{column}"
            for alias, table in self.sources
            for column, _ in TABLES[table]
            if (table, column) in self.indexed
        ]
        if indexed and rng.random() < 0.7:
            column: str | None = rng.choice(indexed)
        else:
            column = self._column(rng.choice(["num", "num", "text"]))
        if column is None:
            return self.boolean(2)
        is_text = column.split(".")[1] in ("b", "y", "v")

        def constant() -> str:
            if is_text:
                return literal(rng.choice(WORDS))
            return literal(rng.choice([rng.randint(-3, 5), rng.randint(-8, 8) / 4]))

        roll = rng.random()
        if roll < 0.4:
            part = f"{column} {rng.choice(['=', '<', '<=', '>', '>='])} {constant()}"
        elif roll < 0.55:
            part = f"{constant()} {rng.choice(['=', '<', '>='])} {column}"
        elif roll < 0.8:
            part = f"{column} IN ({', '.join(constant() for _ in range(rng.randint(1, 3)))})"
        else:
            low, high = sorted([constant(), constant()])
            part = f"{column} BETWEEN {low} AND {high}"
        if rng.random() < 0.4:
            part += f" AND ({self.boolean(1)})"
        return part

    # ── Sorgular ────────────────────────────────────────────────────────────────────────────────

    def _from(self) -> str:
        rng = self.rng
        first = rng.choice(list(TABLES))
        self.sources = [("p", first)]
        clause = f"{first} AS p"
        for alias in ("q", "r")[: rng.choice([0, 0, 1, 1, 2])]:
            table = rng.choice(list(TABLES))
            kind = rng.choice(["JOIN", "LEFT JOIN", "LEFT JOIN", ","])
            self.sources.append((alias, table))
            if kind == ",":
                clause += f", {table} AS {alias}"
                continue
            left_alias = rng.choice([a for a, _ in self.sources[:-1]])
            left_col = rng.choice(["id", "a", "x", "k", "t1_id"])
            pairs = [c for c, d in TABLES[dict(self.sources)[left_alias]] if "INT" in d]
            right_pairs = [c for c, d in TABLES[table] if "INT" in d]
            left_col = rng.choice(pairs)
            on = f"{left_alias}.{left_col} = {alias}.{rng.choice(right_pairs)}"
            if rng.random() < 0.3:
                on += f" AND ({self.boolean(1)})"
            elif rng.random() < 0.15:
                on = self.boolean(1)  # eşitliksiz birleşme: iç içe döngü
            clause += f" {kind} {table} AS {alias} ON {on}"
        return clause

    def select(self) -> tuple[str, bool]:
        """(sorgu, sıralı_mı)."""
        rng = self.rng
        if rng.random() < 0.05:
            self.sources = []
            return f"SELECT {self.num(2)}, {self.text(2)}, {self.boolean(2)}", False
        from_clause = self._from()
        where = f" WHERE {self.where()}" if rng.random() < 0.6 else ""
        if rng.random() < 0.35:
            return self._aggregate_query(from_clause, where)
        items = [self.num(2) if rng.random() < 0.55 else self.text(2) for _ in range(rng.randint(1, 3))]
        if rng.random() < 0.1:
            items = ["*"]
        distinct = "DISTINCT " if rng.random() < 0.2 else ""
        sql = f"SELECT {distinct}{', '.join(items)} FROM {from_clause}{where}"
        return self._order_and_limit(sql, len(items) if items != ["*"] else self._star_width())

    def _star_width(self) -> int:
        return sum(len(TABLES[table]) for _, table in self.sources)

    def _aggregate_query(self, from_clause: str, where: str) -> tuple[str, bool]:
        rng = self.rng
        groups = [self._column(rng.choice(["num", "text"])) for _ in range(rng.choice([0, 1, 1, 2]))]
        group_exprs = [g for g in groups if g is not None]
        aggregates = []
        for _ in range(rng.randint(1, 3)):
            name = rng.choice(["count", "sum", "avg", "min", "max", "count(*)"])
            if name == "count(*)":
                aggregates.append("count(*)")
                continue
            distinct = "DISTINCT " if rng.random() < 0.2 else ""
            use_text = name in ("count", "min", "max") and rng.random() < 0.4
            argument = self.text(1) if use_text else self.num(1, exact=True)
            aggregates.append(f"{name}({distinct}{argument})")
        items = group_exprs + aggregates
        sql = f"SELECT {', '.join(items)} FROM {from_clause}{where}"
        if group_exprs:
            sql += f" GROUP BY {', '.join(group_exprs)}"
            if rng.random() < 0.4:
                having = rng.choice(
                    ["count(*) > 1", f"{aggregates[0]} IS NOT NULL", f"min({self.num(0)}) < 2"]
                )
                sql += f" HAVING {having}"
        return self._order_and_limit(sql, len(items))

    def _order_and_limit(self, sql: str, width: int) -> tuple[str, bool]:
        rng = self.rng
        if rng.random() < 0.5:
            return sql, False
        positions = list(range(1, width + 1))
        rng.shuffle(positions)
        order = ", ".join(f"{p}{rng.choice(['', ' ASC', ' DESC'])}" for p in positions)
        sql += f" ORDER BY {order}"
        if rng.random() < 0.5:
            sql += f" LIMIT {rng.randint(0, 6)}"
            if rng.random() < 0.5:
                sql += f" OFFSET {rng.randint(0, 4)}"
        return sql, True

    def modification(self) -> str:
        rng = self.rng
        table = rng.choice(list(TABLES))
        self.sources = [(table, table)]
        where = f" WHERE {self.where()}" if rng.random() < 0.8 else ""
        roll = rng.random()
        if roll < 0.4:
            columns = [c for c, _ in TABLES[table][1:]]
            column = rng.choice(columns)
            value = self.text(2) if column in ("b", "y", "v") else self.num(2)
            return f"UPDATE {table} SET {column} = {value}{where}"
        if roll < 0.7:
            return f"DELETE FROM {table}{where}"
        names = [c for c, _ in TABLES[table][1:]]
        values = ", ".join(literal(self.value_for(c)) for c in names)
        return f"INSERT INTO {table} ({', '.join(names)}) VALUES ({values})"
