"""Text2SQL motoru: şema dizini, şema bağlama, sütun bağlama, düzeltme döngüsü, aday oylaması, BIRD değerlendirici."""

from __future__ import annotations

import json
import sqlite3

import pytest

pytest.importorskip("sqlglot")

from aiplatform.erp.mock_erp import create_mock_erp
from aiplatform.erp.sql_readonly import SQLReadOnlyConnector
from aiplatform.modules.base import ModuleError, RunContext, get_runtime
from aiplatform.modules.runtimes.dogal_dil_sql import validate_sql
from aiplatform.runtimes.llm import LLMClient, LLMResult
from aiplatform.text2sql import (
    GroundingError,
    SchemaIndex,
    Text2SQL,
    bird,
    ground,
    link_schema,
)
from aiplatform.text2sql.pipeline import Text2SQLError, parse_output

ERP_TABLES = ["cari", "fatura", "satis_aylik", "stok"]


@pytest.fixture(scope="module")
def erp(tmp_path_factory):
    url = create_mock_erp(tmp_path_factory.mktemp("erp") / "ornek.db")
    c = SQLReadOnlyConnector(url, ERP_TABLES)
    yield c
    c.close()


@pytest.fixture(scope="module")
def erp_index(erp) -> SchemaIndex:
    return SchemaIndex.from_ddl(erp.schema_summary(), "sqlite")


@pytest.fixture(scope="module")
def bird_db(tmp_path_factory):
    """BIRD tarzı: boşluklu/parantezli sütun adları, FK'ler, örnek veri."""
    root = tmp_path_factory.mktemp("bird")
    db_dir = root / "california_schools"
    db_dir.mkdir()
    path = db_dir / "california_schools.sqlite"
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE schools ("CDSCode" TEXT PRIMARY KEY, "School" TEXT, "City" TEXT, "Virtual" TEXT);
        CREATE TABLE frpm ("CDSCode" TEXT PRIMARY KEY REFERENCES schools("CDSCode"), "County Name" TEXT,
                           "Free Meal Count (K-12)" REAL, "Enrollment (K-12)" REAL, "Charter School (Y/N)" INTEGER);
        CREATE TABLE satscores (cds TEXT PRIMARY KEY REFERENCES schools("CDSCode"), "AvgScrMath" INTEGER,
                                "NumTstTakr" INTEGER);
        INSERT INTO schools VALUES ('1','Alameda High','Alameda','F'),('2','Berkeley High','Berkeley','P'),
                                   ('3','Fresno High','Fresno','F');
        INSERT INTO frpm VALUES ('1','Alameda',100,500,1),('2','Alameda',300,600,0),('3','Fresno',50,100,0);
        INSERT INTO satscores VALUES ('1',550,100),('2',600,50),('3',450,80);
        """
    )
    con.commit()
    con.close()
    desc = db_dir / "database_description"
    desc.mkdir()
    (desc / "frpm.csv").write_text(
        "original_column_name,column_name,column_description,data_format,value_description\n"
        "Free Meal Count (K-12),,Free Meal Count (K-12),real,eligible free rate = Free Meal Count / Enrollment\n",
        encoding="utf-8",
    )
    return root


# ----------------------------------------------------------------------------- şema dizini


def test_index_from_erp_schema_summary(erp_index):
    assert erp_index.table_names == ERP_TABLES
    fatura = erp_index.table("fatura")
    assert fatura.column("cari_id").references == ("cari", "id")
    assert erp_index.table("cari").column("id").primary_key
    assert erp_index.table("cari").column("il").samples  # örnek satır yorumları okundu
    assert erp_index.table("stok").column("ad").samples == []  # '***' maskeli örnek alınmaz
    prompt = erp_index.to_prompt()
    assert "REFERENCES cari(id)" in prompt and "örnek:" in prompt
    import sqlglot

    assert len(sqlglot.parse(erp_index.to_prompt(samples=False), read="sqlite")) == 4  # yorumlar DDL'i bozmaz


def test_index_from_plain_ddl_regex_fallback():
    ddl = """
    CREATE TABLE personel (
      id INT PRIMARY KEY,
      departman_id INT NOT NULL,
      maas NUMERIC(10,2),
      CONSTRAINT fk_dep FOREIGN KEY (departman_id) REFERENCES departman(id)
    );
    CREATE TABLE departman (id INT, ad VARCHAR(50), PRIMARY KEY (id));
    """
    idx = SchemaIndex.from_ddl(ddl)
    assert set(idx.table_names) == {"personel", "departman"}
    assert idx.table("personel").column("departman_id").references == ("departman", "id")
    assert idx.table("personel").column("maas").type.upper().split("(")[0] in {"NUMERIC", "DECIMAL"}
    assert idx.table("departman").column("id").primary_key


def test_index_from_sqlite_and_descriptions(bird_db):
    path = bird.db_path(bird_db, "california_schools")
    idx = SchemaIndex.from_sqlite(path)
    bird.load_descriptions(bird_db, "california_schools", idx)
    assert set(idx.table_names) == {"schools", "frpm", "satscores"}
    frpm = idx.table("frpm")
    assert frpm.column("CDSCode").references == ("schools", "CDSCode")
    assert frpm.column("Free Meal Count (K-12)").description.startswith("Free Meal Count")
    assert "`Free Meal Count (K-12)`" in idx.to_prompt()
    assert idx.table("frpm").column("County Name").samples == ["Alameda", "Fresno"]


def test_subset_keeps_keys():
    idx = SchemaIndex.from_mapping(
        {"a": {"id": "int", "x": "text", "b_id": "int"}, "b": {"id": "int", "y": "text"}}
    )
    idx.table("a").column("id").primary_key = True
    idx.table("a").column("b_id").references = ("b", "id")
    sub = idx.subset(["a"], {"a": ["x"]})
    assert sub.table_names == ["a"] and sub.table("a").column_names == ["id", "x", "b_id"]


# ----------------------------------------------------------------------------- şema bağlama


def test_linking_prefers_question_and_evidence_columns(bird_db):
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    res = link_schema(
        idx,
        "What is the highest eligible free rate for K-12 students in Alameda County?",
        "Eligible free rate = `Free Meal Count (K-12)` / `Enrollment (K-12)`",
        max_tables=2,
    )
    assert res.tables[0] == "frpm"
    assert res.scores["frpm.Free Meal Count (K-12)"] > res.scores.get("schools.City", 0)
    assert "Alameda" not in res.scores  # değer eşleşmesi sütunu puanlar: County Name
    assert res.scores["frpm.County Name"] > 0


def test_linking_small_schema_keeps_all_tables(erp_index):
    res = link_schema(erp_index, "en çok ciro yapan müşteriler", max_tables=6)
    assert res.tables == ERP_TABLES


def test_linking_turkish_stems(erp_index):
    res = link_schema(erp_index, "faturaların toplamı illere göre", max_tables=2)
    assert set(res.tables) == {"fatura", "cari"}  # 'faturaların' → fatura, 'illere' → il
    assert res.scores.get("fatura.toplam", 0) > 0 and res.scores.get("cari.il", 0) > 0
    assert "stok" not in res.tables


def test_linking_fk_closure_adds_bridge_table():
    idx = SchemaIndex.from_mapping(
        {
            "ogrenci": {"id": "int", "ad": "text"},
            "ders": {"id": "int", "baslik": "text"},
            "kayit": {"ogrenci_id": "int", "ders_id": "int"},
            "bina": {"id": "int", "ad": "text"},
            "oda": {"id": "int", "bina_id": "int"},
            "hoca": {"id": "int", "ad": "text"},
            "bolum": {"id": "int", "ad": "text"},
        }
    )
    idx.table("kayit").column("ogrenci_id").references = ("ogrenci", "id")
    idx.table("kayit").column("ders_id").references = ("ders", "id")
    res = link_schema(idx, "hangi ogrenci hangi ders başlığını aldı", max_tables=2)
    assert {"ogrenci", "ders", "kayit"} <= set(res.tables)


# ----------------------------------------------------------------------------- sütun bağlama


def test_ground_resolves_aliases_ctes_and_subqueries(erp_index):
    g = ground(
        "WITH t AS (SELECT cari_id, SUM(toplam) ciro FROM fatura GROUP BY cari_id) "
        "SELECT c.unvan, t.ciro FROM t JOIN cari c ON c.id = t.cari_id "
        "WHERE c.id IN (SELECT cari_id FROM fatura WHERE durum = 'odendi')",
        erp_index,
    )
    assert g.tables == ["cari", "fatura"]
    assert g.columns == ["cari.id", "cari.unvan", "fatura.cari_id", "fatura.durum", "fatura.toplam"]


def test_ground_rejects_invented_column_with_suggestions(erp_index):
    with pytest.raises(GroundingError) as ei:
        ground("SELECT musteri_unvani FROM cari", erp_index)
    assert ei.value.column == "musteri_unvani"
    assert "cari.unvan" in ei.value.suggestions and "Şemada olmayan sütun" in ei.value.message


def test_ground_rejects_invented_column_inside_subquery(erp_index):
    with pytest.raises(GroundingError) as ei:
        ground("SELECT x.unvan FROM (SELECT unvan, bakiye FROM cari) x", erp_index)
    assert ei.value.column == "bakiye"


def test_ground_rejects_unknown_table(erp_index):
    with pytest.raises(GroundingError) as ei:
        ground("SELECT * FROM musteri", erp_index)
    assert "musteri" in ei.value.message and "cari" in ei.value.suggestions


def test_ground_flags_ambiguous_column(erp_index):
    with pytest.raises(GroundingError) as ei:
        ground("SELECT id FROM fatura JOIN cari ON cari.id = fatura.cari_id", erp_index)
    assert set(ei.value.suggestions) == {"cari.id", "fatura.id"}


def test_ground_handles_quoted_bird_identifiers(bird_db):
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    g = ground(
        "SELECT MAX(CAST(`Free Meal Count (K-12)` AS REAL) / `Enrollment (K-12)`) FROM frpm "
        "WHERE `County Name` = 'Alameda'",
        idx,
    )
    assert g.columns == ["frpm.County Name", "frpm.Enrollment (K-12)", "frpm.Free Meal Count (K-12)"]
    with pytest.raises(GroundingError) as ei:
        ground("SELECT `Free Meal Rate` FROM frpm", idx)
    assert "frpm.`Free Meal Count (K-12)`" in ei.value.suggestions  # tırnaklı: SQL'e aynen yapıştırılabilir


def test_ground_star_expands_to_real_columns(erp_index):
    g = ground("SELECT * FROM satis_aylik WHERE ay LIKE '2026%'", erp_index)
    assert g.columns == ["satis_aylik.adet", "satis_aylik.ay", "satis_aylik.tutar"]


def test_ground_wrong_table_names_real_owner(bird_db):
    """BIRD'de 1.5B modelin gerçek hatası: frpm takma adıyla schools sütunu (f.City)."""
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    with pytest.raises(GroundingError) as ei:
        ground("SELECT f.`County Name`, f.City FROM frpm f JOIN schools s ON s.CDSCode = f.CDSCode", idx)
    e = ei.value
    assert e.kind == "wrong_table" and e.column == "City" and e.suggestions == ["schools.City"]
    assert "frpm (alias f)" in e.table
    en = e.render("en")
    assert en.startswith("Column City does not exist in table frpm (alias f). It exists in: schools.City")
    assert "tablosunda yok" in e.message  # platform/kullanıcı için Türkçe


def test_ground_reports_all_issues_at_once_with_join_hints(bird_db):
    """Gerçek BIRD hatası: üç yanlış-tablo sütunu; model hepsini tek turda görmeli, eksik tablo için JOIN koşulu."""
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    sql = (
        "SELECT f.City, s.AvgScrMath, f.Virtual FROM frpm f JOIN schools s ON s.CDSCode = f.CDSCode "
        "WHERE s.AvgScrMath > 500"
    )
    with pytest.raises(GroundingError) as ei:
        ground(sql, idx)
    e = ei.value
    assert [i.column for i in e.issues] == ["City", "AvgScrMath", "Virtual"]
    en = e.render("en")
    assert en.startswith("3 problems in the query:")
    assert "It exists in: satscores.AvgScrMath" in en and "join it with satscores.cds = schools.CDSCode" in en
    assert en.count("join it with") == 1  # schools zaten sorguda; yalnız satscores eksik


def test_ground_unknown_bare_column_gets_join_hint(bird_db):
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    with pytest.raises(GroundingError) as ei:
        ground("SELECT School, county_name FROM schools", idx)
    e = ei.value
    assert e.kind == "unknown_column" and e.suggestions == ["frpm.`County Name`"]
    assert e.join_hint == "frpm.CDSCode = schools.CDSCode"
    assert "JOIN et" in e.message and "join it with frpm.CDSCode = schools.CDSCode" in e.render("en")


def test_ground_nearest_ignores_case_and_separators(bird_db):
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    with pytest.raises(GroundingError) as ei:
        ground("SELECT county_name FROM frpm", idx)
    assert ei.value.kind == "unknown_column" and ei.value.column == "county_name"
    assert ei.value.suggestions[0] == "frpm.`County Name`"
    assert "closest matches: frpm.`County Name`" in ei.value.render("en")


def test_ground_unqualified_error_keeps_original_spelling(erp_index):
    with pytest.raises(GroundingError) as ei:
        ground("SELECT MusteriAdi FROM cari", erp_index)
    assert ei.value.column == "MusteriAdi"


def test_ground_alias_reused_in_subquery_is_not_false_positive(erp_index):
    g = ground(
        "SELECT t.unvan FROM cari t WHERE t.id IN (SELECT t.cari_id FROM fatura t WHERE t.durum = 'odendi')",
        erp_index,
    )
    assert g.tables == ["cari", "fatura"]


# ----------------------------------------------------------------------------- çıktı ayrıştırma


def test_parse_output_accepts_json_fence_and_plain_sql():
    assert parse_output({"sql": "SELECT 1", "explanation": "a"}) == ("SELECT 1", "a")
    assert parse_output('<think>hmm</think>{"sql": "SELECT 2", "explanation": "b"}') == ("SELECT 2", "b")
    assert parse_output("```sql\nSELECT 3\n```") == ("SELECT 3", "")
    assert parse_output("select 4;") == ("select 4", "")
    assert parse_output("Bilmiyorum.") == ("", "")


def test_parse_output_takes_last_sql_block_from_reasoning():
    text = (
        "First count rows:\n```sql\nSELECT COUNT(*) FROM t\n```\nThen filter.\n"
        "```python\ncur.execute('SELECT x FROM y')\n```\nFinal:\n```sql\n-- final\nSELECT a FROM t WHERE b = 1;\n```"
    )
    assert parse_output(text) == ("SELECT a FROM t WHERE b = 1", "")
    assert parse_output("```\nWITH q AS (SELECT 1) SELECT * FROM q\n```")[0].startswith("WITH q")
    assert parse_output("```python\nprint(1)\n```") == ("", "")


def test_messages_cot_style_single_user_turn(erp_index):
    engine = Text2SQL(_gen_from([]), dialect="sqlite", lang="en", style="cot")
    msgs = engine.messages_for(erp_index, "how many invoices", "invoice = fatura")
    assert len(msgs) == 1 and msgs[0]["role"] == "user"
    body = msgs[0]["content"]
    assert "Database Engine:\nSQLite" in body and "CREATE TABLE fatura" in body
    assert (
        "External knowledge: invoice = fatura\nhow many invoices" in body
        and "{" not in body.split("```sql")[0][-5:]
    )
    assert engine.assistant_echo("SELECT 1") == "```sql\nSELECT 1\n```"
    with pytest.raises(ValueError):
        Text2SQL(_gen_from([]), style="xml")


async def test_pipeline_cot_style_repairs_with_fenced_answers(erp_index):
    gen = _gen_from(
        [
            "Reasoning...\n```sql\nSELECT bakiye FROM cari\n```",
            "Fixed:\n```sql\nSELECT unvan FROM cari\n```",
        ]
    )
    engine = Text2SQL(gen, dialect="sqlite", lang="en", style="cot")
    res = await engine.run("customer names", erp_index)
    assert res.sql == "SELECT unvan FROM cari" and res.attempts[0]["error_kind"] == "grounding"
    second = gen.calls[1]
    assert second[-2] == {"role": "assistant", "content": "```sql\nSELECT bakiye FROM cari\n```"}
    assert "```sql code block" in second[-1]["content"]


# ----------------------------------------------------------------------------- hat (pipeline)


def _gen_from(answers: list):
    calls: list[list[dict]] = []

    async def gen(messages, temperature):
        calls.append(messages)
        ans = answers[min(len(calls) - 1, len(answers) - 1)]
        return json.dumps(ans) if isinstance(ans, dict) else ans

    gen.calls = calls  # type: ignore[attr-defined]
    return gen


async def test_pipeline_repairs_hallucinated_column(erp, erp_index):
    gen = _gen_from(
        [
            {
                "sql": "SELECT musteri_adi, SUM(toplam) FROM fatura JOIN cari ON cari.id = fatura.cari_id GROUP BY 1"
            },
            (
                "```sql\nSELECT c.unvan, SUM(f.toplam) AS ciro FROM fatura f JOIN cari c ON c.id = f.cari_id "
                "GROUP BY c.unvan ORDER BY ciro DESC LIMIT 3\n```"
            ),
        ]
    )
    engine = Text2SQL(
        gen,
        executor=lambda s: erp.run_query(s, max_rows=50)["rows"],
        security=lambda s: validate_sql(s, ERP_TABLES, "sqlite"),
        dialect="sqlite",
    )
    res = await engine.run("en çok ciro yapan 3 müşteri", erp_index)
    assert res.sql.startswith("SELECT c.unvan") and len(res.rows) == 3
    assert res.tables == ["cari", "fatura"] and "cari.unvan" in res.columns
    assert [a["ok"] for a in res.attempts] == [False, True]
    assert res.attempts[0]["error_kind"] == "grounding" and "musteri_adi" in res.attempts[0]["error"]
    repair_msg = gen.calls[1][-1]["content"]
    assert "reddedildi" in repair_msg and "yakın adaylar" in repair_msg
    assert gen.calls[1][-2]["role"] == "assistant"  # önceki yanıt sohbete eklendi


async def test_pipeline_gives_up_after_max_repairs(erp_index):
    gen = _gen_from([{"sql": "SELECT yok FROM cari"}])
    engine = Text2SQL(gen, dialect="sqlite", max_repairs=1)
    with pytest.raises(Text2SQLError) as ei:
        await engine.run("x", erp_index)
    assert len(gen.calls) == 2 and "yok" in ei.value.message
    assert ei.value.attempts[-1].get("gave_up")


async def test_pipeline_security_rejection_feeds_back(erp_index):
    gen = _gen_from([{"sql": "DELETE FROM cari"}, {"sql": "SELECT COUNT(*) AS n FROM cari"}])
    engine = Text2SQL(gen, security=lambda s: validate_sql(s, ERP_TABLES, "sqlite"), dialect="sqlite")
    res = await engine.run("kaç cari var", erp_index)
    assert res.attempts[0]["error_kind"] == "security" and res.sql.endswith("LIMIT 200")


async def test_pipeline_execution_error_feeds_back(erp, erp_index):
    gen = _gen_from(
        [
            {"sql": "SELECT SUBSTR(tarih, 1, 4) AS yil, SUM(toplam) FROM fatura GROUP BY yil HAVING yil > x"},
            {"sql": "SELECT SUBSTR(tarih, 1, 4) AS yil, SUM(toplam) FROM fatura GROUP BY yil"},
        ]
    )
    # 'x' sütunu şemada yok → bağlama hatası; ikinci sorgu geçer ve çalışır
    engine = Text2SQL(gen, executor=lambda s: erp.run_query(s, max_rows=50)["rows"], dialect="sqlite")
    res = await engine.run("yıllık ciro", erp_index)
    assert res.rows and res.attempts[0]["error_kind"] == "grounding"


async def test_pipeline_majority_vote_by_result_set(erp, erp_index):
    a = "SELECT COUNT(*) AS n FROM cari"
    b = "SELECT COUNT(*) AS n FROM cari WHERE il = 'Ankara'"
    gen = _gen_from([{"sql": b}, {"sql": a}, {"sql": "SELECT COUNT(id) AS n FROM cari"}])
    engine = Text2SQL(
        gen, executor=lambda s: erp.run_query(s, max_rows=50)["rows"], dialect="sqlite", candidates=3
    )
    res = await engine.run("kaç cari var", erp_index)
    assert res.selected_by == "vote" and res.sql == a and res.rows == [[32]]
    assert res.candidates == 3 and len(gen.calls) == 3
    assert gen.calls[1] == gen.calls[0]  # adaylar aynı istemden üretilir (sıcaklık farklı)


async def test_pipeline_greedy_wins_ties(erp, erp_index):
    gen = _gen_from([{"sql": "SELECT COUNT(*) AS n FROM cari"}, {"sql": "SELECT COUNT(*) AS n FROM fatura"}])
    engine = Text2SQL(
        gen, executor=lambda s: erp.run_query(s, max_rows=50)["rows"], dialect="sqlite", candidates=2
    )
    res = await engine.run("kaç kayıt", erp_index)
    assert res.sql == "SELECT COUNT(*) AS n FROM cari" and res.selected_by == "vote"


async def test_pipeline_links_large_schema_but_grounds_against_full(bird_db):
    idx = SchemaIndex.from_sqlite(bird.db_path(bird_db, "california_schools"))
    gen = _gen_from(
        [
            {
                "sql": "SELECT s.School FROM schools s JOIN satscores t ON t.cds = s.CDSCode ORDER BY t.AvgScrMath DESC LIMIT 1"
            }
        ]
    )
    engine = Text2SQL(gen, dialect="sqlite", max_tables=1, lang="en")
    res = await engine.run("Which school has the highest average math score?", idx)
    assert res.linked_tables and len(res.linked_tables) <= 2
    assert res.tables == ["satscores", "schools"]
    system = gen.calls[0][0]["content"]
    assert "SQL-only engine" in system and "SQL dialect: sqlite" in system and "<!--" not in system


def test_messages_for_includes_evidence_and_schema(erp_index):
    engine = Text2SQL(_gen_from([]), dialect="sqlite")
    msgs = engine.messages_for(erp_index, "kaç fatura var", "fatura = invoice")
    assert msgs[0]["role"] == "system" and "yalnız SQL" in msgs[0]["content"]
    assert "CREATE TABLE fatura" in msgs[1]["content"] and "İPUCU" in msgs[1]["content"]
    assert msgs[1]["content"].rstrip().endswith("SORU: kaç fatura var")


# ----------------------------------------------------------------------------- modül çalışma zamanı


async def test_runtime_ask_grounds_and_repairs(monkeypatch, erp):
    answers = [
        {"sql": "SELECT unvan, bakiye FROM cari ORDER BY bakiye DESC", "explanation": "uydurma"},
        {
            "sql": "SELECT unvan, risk_sinifi FROM cari WHERE risk_sinifi = 'D'",
            "explanation": "riskli cariler",
        },
    ]
    seen = []

    async def fake_chat(self, messages, **kw):
        seen.append(messages)
        return LLMResult(content="", model="qwen2.5-coder-7b", parsed=answers[min(len(seen) - 1, 1)])

    monkeypatch.setattr(LLMClient, "chat", fake_chat)
    ctx = RunContext()
    res = await get_runtime("dogal-dil-sql").run(
        "ask",
        {
            "question": "riskli cariler",
            "schema_ddl": erp.schema_summary(),
            "dry_run": True,
            "evidence": "risk D en kötü",
        },
        ctx,
    )
    assert res["dry_run"] is True and res["sql"].startswith("SELECT unvan, risk_sinifi")
    assert res["tables"] == ["cari"] and res["used_columns"] == ["cari.risk_sinifi", "cari.unvan"]
    assert res["attempts"][0]["error_kind"] == "grounding" and len(res["attempts"]) == 2
    assert ctx.extra["meta"]["turns"] == 2 and ctx.extra["model"] == "qwen2.5-coder-7b"
    assert "İPUCU" in seen[0][1]["content"] and "İzinli tablolar" in seen[0][0]["content"]


async def test_runtime_ask_hides_unlisted_tables(monkeypatch, erp):
    async def fake_chat(self, messages, **kw):
        assert "CREATE TABLE stok" not in messages[1]["content"]
        return LLMResult(
            content="", model="m", parsed={"sql": "SELECT COUNT(*) AS n FROM cari", "explanation": ""}
        )

    monkeypatch.setattr(LLMClient, "chat", fake_chat)
    res = await get_runtime("dogal-dil-sql").run(
        "ask",
        {"question": "kaç cari", "schema_ddl": erp.schema_summary(), "allowed_tables": ["cari"]},
        RunContext(),
    )
    assert res["sql"] == "SELECT COUNT(*) AS n FROM cari LIMIT 200"


async def test_runtime_ask_fails_cleanly_when_model_keeps_inventing(monkeypatch, erp):
    async def fake_chat(self, messages, **kw):
        return LLMResult(content="", model="m", parsed={"sql": "SELECT bakiye FROM cari", "explanation": ""})

    monkeypatch.setattr(LLMClient, "chat", fake_chat)
    ctx = RunContext()
    with pytest.raises(ModuleError) as ei:
        await get_runtime("dogal-dil-sql").run(
            "ask", {"question": "bakiye", "schema_ddl": erp.schema_summary(), "max_repairs": 1}, ctx
        )
    assert "bakiye" in str(ei.value) and len(ctx.extra["meta"]["attempts"]) == 3  # 2 tur + vazgeçme kaydı


# ----------------------------------------------------------------------------- BIRD değerlendirici


async def test_bird_evaluate_scores_execution_accuracy(bird_db, tmp_path):
    items = [
        {
            "idx": 0,
            "db_id": "california_schools",
            "question": "Highest eligible free rate in Alameda County?",
            "evidence": "rate = `Free Meal Count (K-12)` / `Enrollment (K-12)`",
            "gold": "SELECT MAX(`Free Meal Count (K-12)` / `Enrollment (K-12)`) FROM frpm WHERE `County Name` = 'Alameda'",
            "difficulty": "simple",
        },
        {
            "idx": 1,
            "db_id": "california_schools",
            "question": "How many schools are virtual?",
            "evidence": "",
            "gold": "SELECT COUNT(*) FROM schools WHERE Virtual = 'F'",
            "difficulty": "moderate",
        },
    ]
    answers = {
        "Highest": {
            "sql": "SELECT MAX(`Free Meal Count (K-12)` / `Enrollment (K-12)`) FROM frpm WHERE `County Name` = 'Alameda'"
        },
        "How many": {"sql": "SELECT COUNT(*) FROM schools WHERE Virtual = 'P'"},  # yanlış değer → EX 0
    }

    async def gen(messages, temperature):
        q = messages[-1]["content"]
        key = "Highest" if "Highest" in q else "How many"
        return json.dumps(answers[key])

    report = await bird.evaluate(items, bird_db, gen, out_dir=tmp_path, lang="en")
    assert report["n"] == 2 and report["execution_accuracy"] == 50.0
    assert (
        report["first_turn_ex"] == 50.0
        and report["fixed_by_pipeline"] == 0
        and report["broken_by_pipeline"] == 0
    )
    assert (
        report["by_difficulty"]["simple"]["ex"] == 100.0 and report["by_difficulty"]["moderate"]["ex"] == 0.0
    )
    pred = json.loads((tmp_path / "predict_dev.json").read_text(encoding="utf-8"))
    assert pred["0"].endswith("\t----- bird -----\tcalifornia_schools") and pred["0"].startswith("SELECT MAX")
    assert (tmp_path / "attempts.jsonl").read_text(encoding="utf-8").count("\n") == 2


def test_bird_load_items_and_exec_match(tmp_path):
    dev = tmp_path / "dev.json"
    dev.write_text(
        json.dumps(
            [
                {
                    "question_id": 7,
                    "db_id": "a",
                    "question": "q",
                    "evidence": "e",
                    "SQL": "SELECT 1",
                    "difficulty": "simple",
                },
                {"question_id": 8, "db_id": "b", "question": "q2", "SQL": "SELECT 2"},
            ]
        ),
        encoding="utf-8",
    )
    items = bird.load_items(dev, db_ids={"a"})
    assert items == [
        {"idx": 7, "db_id": "a", "question": "q", "evidence": "e", "gold": "SELECT 1", "difficulty": "simple"}
    ]
    assert bird.exec_match([(1, 2.0000001), (3, 4)], [(3, 4), (1, 2.0)])
    assert not bird.exec_match([(1,)], [(2,)]) and not bird.exec_match(None, [(1,)])


async def test_bird_evaluate_counts_pipeline_fix_against_first_turn(bird_db, tmp_path):
    item = {
        "idx": 9,
        "db_id": "california_schools",
        "question": "How many schools?",
        "evidence": "",
        "gold": "SELECT COUNT(*) FROM schools",
        "difficulty": "simple",
    }
    answers = iter(
        [{"sql": "SELECT COUNT(SchoolName) FROM schools"}, {"sql": "SELECT COUNT(*) FROM schools"}]
    )

    async def gen(messages, temperature):
        return json.dumps(next(answers))

    out = tmp_path / "yeni" / "alt"  # henüz yok: evaluate kendisi oluşturmalı
    report = await bird.evaluate([item], bird_db, gen, out_dir=out, lang="en")
    assert (out / "attempts.jsonl").exists() and (out / "predict_dev.json").exists()
    assert report["execution_accuracy"] == 100.0 and report["first_turn_ex"] == 0.0
    assert report["fixed_by_pipeline"] == 1 and report["hallucinated_column_or_table"] == 1
    assert report["repaired_then_correct"] == 1


async def test_pipeline_format_error_asks_for_sql_only_and_echoes_tail(erp_index):
    long_reasoning = "Step " * 400  # sınırda kesilmiş akıl yürütme, SQL bloğu yok
    gen = _gen_from([long_reasoning, "```sql\nSELECT COUNT(*) FROM cari\n```"])
    engine = Text2SQL(gen, dialect="sqlite", lang="en", style="cot")
    res = await engine.run("how many", erp_index)
    assert res.sql == "SELECT COUNT(*) FROM cari" and res.attempts[0]["error_kind"] == "format"
    second = gen.calls[1]
    assert len(second[-2]["content"]) <= 800 and second[-2]["content"].endswith("Step ")
    assert second[-1]["content"].startswith("Your answer did not contain a final ```sql code block")


async def test_pipeline_sends_english_grounding_error_to_english_model(erp_index):
    gen = _gen_from([{"sql": "SELECT f.unvan FROM fatura f"}, {"sql": "SELECT unvan FROM cari"}])
    engine = Text2SQL(gen, dialect="sqlite", lang="en")
    res = await engine.run("names", erp_index)
    assert res.attempts[0]["grounding_kind"] == "wrong_table"
    assert "tablosunda yok" in res.attempts[0]["error"]  # kayıt Türkçe
    assert (
        "Column unvan does not exist in table fatura (alias f). It exists in: cari.unvan"
        in gen.calls[1][-1]["content"]
    )
