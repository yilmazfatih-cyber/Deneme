import pytest

from text2sql.errors import ReadOnlyError, SQLNotFoundError
from text2sql.sqlutil import ensure_read_only, extract_sql, extract_statements, is_read_only, split_statements, statement_type


def test_fenced_sql():
    text = "İşte sorgu:\n```sql\nSELECT ad FROM urunler WHERE stok = 0;\n```\nBu sorgu stokta olmayanları listeler."
    assert extract_sql(text) == "SELECT ad FROM urunler WHERE stok = 0"


def test_fence_without_language_and_uppercase_lang():
    assert extract_sql("```\nSELECT 1 AS x FROM t\n```") == "SELECT 1 AS x FROM t"
    assert extract_sql("```SQLite\nselect * from t\n```") == "select * from t"


def test_unclosed_fence():
    assert extract_sql("```sql\nSELECT COUNT(*) FROM musteriler") == "SELECT COUNT(*) FROM musteriler"


def test_unfenced_with_turkish_text_around():
    text = "Elbette! Sorgu şu şekilde olmalı: SELECT ad, soyad FROM musteriler WHERE sehir_id = 1; Umarım işinize yarar."
    assert extract_sql(text) == "SELECT ad, soyad FROM musteriler WHERE sehir_id = 1"


def test_unfenced_without_semicolon_trailing_prose_line():
    text = "SELECT kategori, COUNT(*)\nFROM urunler\nGROUP BY kategori\nBu sorgu her kategorideki ürün sayısını verir."
    assert extract_sql(text) == "SELECT kategori, COUNT(*)\nFROM urunler\nGROUP BY kategori"


def test_unfenced_stops_at_blank_line():
    text = "SQL:\nselect ad from urunler\nwhere fiyat > 100\n\nAçıklama: fiyatı 100 TL üstü olanlar."
    assert extract_sql(text) == "select ad from urunler\nwhere fiyat > 100"


def test_english_with_in_prose_is_not_sql():
    text = "Here is the query with a join:\nSELECT m.ad FROM musteriler m JOIN sehirler s ON s.id = m.sehir_id"
    assert extract_sql(text).startswith("SELECT m.ad")


def test_cte_is_extracted():
    text = "```sql\nWITH t AS (SELECT musteri_id, COUNT(*) n FROM siparisler GROUP BY 1)\nSELECT * FROM t ORDER BY n DESC;\n```"
    assert extract_sql(text).startswith("WITH t AS")


def test_multiple_statements_first_only():
    stmts = extract_statements("```sql\nSELECT 1 FROM a;\nSELECT 2 FROM b;\n```")
    assert stmts == ["SELECT 1 FROM a", "SELECT 2 FROM b"]
    assert extract_sql("```sql\nSELECT 1 FROM a; DROP TABLE a;\n```") == "SELECT 1 FROM a"


def test_semicolon_inside_string_and_comment():
    sql = "SELECT 'a;b' AS x FROM t -- yorum; burada\nWHERE y = ';'"
    assert split_statements(sql) == [sql]
    assert extract_sql("```sql\n" + sql + ";\n```") == sql


def test_special_tokens_are_removed():
    assert extract_sql("```sql\nSELECT * FROM t;\n```<|im_end|>") == "SELECT * FROM t"


def test_no_sql_raises():
    with pytest.raises(SQLNotFoundError):
        extract_sql("Bu soruyu şemadaki tablolarla cevaplayamıyorum.")
    with pytest.raises(SQLNotFoundError):
        extract_sql("")


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM t",
        "  -- yorum\n select a from t",
        "WITH x AS (SELECT 1) SELECT * FROM x",
        "EXPLAIN QUERY PLAN SELECT * FROM t",
        "PRAGMA table_info(t)",
        "SELECT 'DELETE' AS kelime FROM t",
        'SELECT "update" FROM t',
        "VALUES (1)",
    ],
)
def test_read_only_allowed(sql):
    assert is_read_only(sql)
    ensure_read_only(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM t",
        "insert into t values (1)",
        "UPDATE t SET a = 1",
        "DROP TABLE t",
        "ALTER TABLE t ADD COLUMN b",
        "CREATE TABLE x (a)",
        "WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d",
        "SELECT * INTO yeni FROM t",
        "PRAGMA journal_mode = DELETE",
        "EXPLAIN ANALYZE DELETE FROM t",
        "ATTACH DATABASE 'x.db' AS x",
        "/* gizli */ TRUNCATE t",
        "",
    ],
)
def test_read_only_refused(sql):
    assert not is_read_only(sql)
    with pytest.raises(ReadOnlyError) as exc:
        ensure_read_only(sql)
    assert "--yaz" in str(exc.value)


def test_statement_type():
    assert statement_type("/* x */ with a as (select 1) select * from a") == "WITH"
    assert statement_type("") == ""


# --- inceleme 1: lehçeye bağlı ters bölü, çoklu ifade, işlev biçimli REPLACE, tek satırlık çit, <think>

ATTACK = "SELECT '\\'; COMMIT; DROP TABLE t; --'"


def test_backslash_is_dialect_aware():
    # PostgreSQL / SQLite: '\' kendi başına bir dizgi -> üç ifade
    assert len(split_statements(ATTACK, "postgresql")) == 3
    assert len(split_statements(ATTACK, "sqlite")) == 3
    # MySQL: \' kaçış -> tek ifade, tek dizgi
    assert split_statements(ATTACK, "mysql") == [ATTACK]
    # PostgreSQL E'' dizgisinde ters bölü kaçıştır
    assert len(split_statements("SELECT E'\\'; x' AS a", "postgresql")) == 1


@pytest.mark.parametrize("dialect", ["postgresql", "mysql", "sqlite", None])
def test_multiple_statements_refused(dialect):
    from text2sql.sqlutil import ensure_single_statement

    with pytest.raises(ReadOnlyError, match="birden çok") as exc:
        ensure_single_statement("SELECT 1; DROP TABLE t", dialect)
    assert exc.value.sql
    ensure_single_statement("SELECT ';' AS x", dialect)  # dizgi içindeki ; sayılmaz


@pytest.mark.parametrize("dialect", ["postgresql", "mysql", "sqlite", None])
def test_backslash_attack_refused_in_every_dialect(dialect):
    # MySQL'de bu tek bir dizgidir, ama sunucu NO_BACKSLASH_ESCAPES ile çalışıyor olabilir:
    # sunucu lehçelerinde iki yorum da denenir, biri bile çoklu ifade görürse reddedilir.
    from text2sql.sqlutil import ensure_single_statement

    with pytest.raises(ReadOnlyError, match="birden çok"):
        ensure_single_statement(ATTACK, dialect)


def test_extraction_with_dialect_takes_first_statement_only():
    reply = "```sql\n" + ATTACK + "\n```"
    assert extract_sql(reply, "postgresql") == "SELECT '\\'"
    assert extract_sql(reply, "mysql") == ATTACK


@pytest.mark.parametrize(
    "sql,dialect",
    [
        ("SELECT REPLACE(ad, 'İ', 'I') AS ad FROM sehirler", None),
        ("SELECT replace (ad, 'a', 'b') FROM t", None),
        ("SELECT INSERT(ad, 1, 2, 'xy') FROM t", "mysql"),
        ("PRAGMA main.table_info(t)", "sqlite"),
        ("PRAGMA foreign_key_list('t')", "sqlite"),
    ],
)
def test_function_style_words_are_reads(sql, dialect):
    assert is_read_only(sql, dialect)


@pytest.mark.parametrize(
    "sql,reason",
    [
        ("WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d", "DELETE, WITH içinde"),
        ("SELECT * INTO yeni FROM t", "INTO, SELECT içinde"),
        ("REPLACE INTO t VALUES (1)", "REPLACE"),
        ("PRAGMA user_version(5)", "PRAGMA user_version"),
        ("PRAGMA journal_mode(WAL)", "PRAGMA journal_mode"),
        ("VACUUM", "VACUUM"),
        ("REINDEX t", "REINDEX"),
        ("ATTACH 'x.db' AS x", "ATTACH"),
        ("EXPLAIN ANALYZE DELETE FROM t", "DELETE, EXPLAIN ANALYZE içinde"),
    ],
)
def test_refusal_names_the_write_keyword(sql, reason):
    from text2sql.sqlutil import write_reason

    assert write_reason(sql) == reason
    with pytest.raises(ReadOnlyError) as exc:
        ensure_read_only(sql)
    assert f"({reason})" in str(exc.value) and exc.value.sql == sql


@pytest.mark.parametrize(
    "reply",
    [
        "```sql SELECT COUNT(*) FROM musteriler```",
        "```sql SELECT COUNT(*) FROM musteriler;```",
        "Sorgu: ```SELECT COUNT(*) FROM musteriler```",
        "```sql\nSELECT COUNT(*) FROM musteriler`\n```",
        "SELECT COUNT(*) FROM musteriler```",
    ],
)
def test_one_line_fence_and_stray_backticks(reply):
    assert extract_sql(reply) == "SELECT COUNT(*) FROM musteriler"


def test_mysql_backtick_identifiers_kept():
    assert extract_sql("```sql\nSELECT `ad` FROM `urunler`\n```", "mysql") == "SELECT `ad` FROM `urunler`"


def test_non_sql_fence_is_skipped():
    reply = "```python\nprint('SELECT 1 FROM t')\n```\n```sql\nSELECT 2 FROM t\n```"
    assert extract_sql(reply) == "SELECT 2 FROM t"


def test_think_block_removed_and_last_fence_wins():
    reply = (
        "<think>Önce şuna bakayım:\n```sql\nSELECT taslak FROM t\n```\nhayır, düzelteyim.</think>\n"
        "<answer>```sql\nSELECT ilk FROM t\n```\nDaha iyisi:\n```sql\nSELECT son FROM t\n```</answer>"
    )
    assert extract_sql(reply) == "SELECT son FROM t"
    with pytest.raises(SQLNotFoundError):  # kapanmamış düşünme: yarım taslak SQL sayılmaz
        extract_sql("<think>belki ```sql\nSELECT yarim FROM t")


def test_first_fence_wins_without_reasoning_tags():
    reply = (
        "```sql\nSELECT ad FROM urunler WHERE stok = 0;\n```\n"
        "İsterseniz kategoriye göre de süzebilirsiniz:\n```sql\nSELECT ad FROM urunler WHERE kategori = 'Gıda';\n```"
    )
    assert extract_sql(reply) == "SELECT ad FROM urunler WHERE stok = 0"


def test_last_fence_wins_with_answer_tag_only():
    reply = "<answer>```sql\nSELECT ilk FROM t\n```\nDüzeltme:\n```sql\nSELECT son FROM t\n```</answer>"
    assert extract_sql(reply) == "SELECT son FROM t"
