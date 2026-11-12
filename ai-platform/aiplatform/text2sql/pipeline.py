"""Üret → denetle → bağla → çalıştır → düzelt → oyla.

`Text2SQL` modelden bağımsızdır: bir `generate(messages, temperature)` eşzamansız işlevi alır (platformun
`LLMClient`'ı, BIRD değerlendiricisinin ham HTTP istemcisi ya da testteki sahte işlev). Zincir:

1. Şema bağlama: büyük şemalarda yalnız ilgili tablolar/sütunlar isteme girer (`linking`).
2. Üretim: JSON `{"sql", "explanation"}`; ilk aday sıcaklık 0 (açgözlü), diğer adaylar örneklemeli.
3. Güvenlik denetimi (`security`: ör. `dogal_dil_sql.validate_sql` — tek SELECT, beyaz liste, LIMIT).
4. Sütun bağlama (`grounding.ground`): olmayan tablo/sütun → somut hata mesajıyla düzeltme turu.
5. Çalıştırma (`executor` verildiyse): SQL hatası / boş sonuç → düzeltme turu ("boş sonuç" yalnız uyarı).
6. Aday oylaması: aynı sonuç kümesini veren adaylar birleşir, en kalabalık küme kazanır (ex. self-consistency).

Her tur kaydedilir (`attempts`): neyin reddedildiği, modele ne söylendiği denetlenebilir.
"""

from __future__ import annotations

import inspect
import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .grounding import Grounded, GroundingError, ground
from .linking import link_schema
from .schema import SchemaIndex

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "modules" / "prompts"
Generator = Callable[[list[dict], float], Awaitable[Any]]
Executor = Callable[[str], Any]
Security = Callable[[str], str]

_SQL_FENCE_RE = re.compile(r"```(?:sql)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)
_FENCE_RE = re.compile(r"```([a-zA-Z]*)[ \t]*\n?(.*?)```", re.DOTALL)
_SQL_START_RE = re.compile(r"^\s*(?:--[^\n]*\n\s*)*(with|select)\b", re.IGNORECASE)


def _last_sql_block(text: str) -> str:
    """Akıl yürüten modeller ara sorgular da yazar; son ```sql``` bloğu nihai yanıttır. Etiketsiz blok ancak
    SELECT/WITH ile başlıyorsa kabul edilir (```python``` içindeki SQL alınmaz)."""
    blocks = _FENCE_RE.findall(text)
    tagged = [b.strip() for tag, b in blocks if tag.lower() == "sql" and b.strip()]
    if tagged:
        return _strip_sql(tagged[-1])
    plain = [b.strip() for tag, b in blocks if not tag and _SQL_START_RE.match(b)]
    return _strip_sql(plain[-1]) if plain else ""


def _strip_sql(sql: str) -> str:
    lines = [ln for ln in sql.strip().splitlines() if not ln.strip().startswith("--")]
    return "\n".join(lines).strip().rstrip(";").strip()


class Text2SQLError(Exception):
    """Hiçbir aday denetimlerden geçemedi. `attempts` tüm turları taşır."""

    def __init__(self, message: str, attempts: list[dict]):
        super().__init__(message)
        self.message = message
        self.attempts = attempts


@dataclass
class Text2SQLResult:
    sql: str
    explanation: str
    tables: list[str]
    columns: list[str]
    attempts: list[dict] = field(default_factory=list)
    candidates: int = 1
    selected_by: str = "greedy"  # greedy | vote | only_valid
    linked_tables: list[str] = field(default_factory=list)
    rows: list | None = None  # executor verildiyse seçilen adayın sonucu
    columns_out: list[str] | None = None

    def as_dict(self) -> dict:
        d = {
            "sql": self.sql,
            "explanation": self.explanation,
            "tables": self.tables,
            "columns": self.columns,
            "attempts": self.attempts,
            "candidates": self.candidates,
            "selected_by": self.selected_by,
            "linked_tables": self.linked_tables,
        }
        return d


STYLES = ("json", "cot")


def load_prompt(lang: str = "tr", style: str = "json") -> str:
    """`json`: sistem istemi + JSON çıktı. `cot`: tek kullanıcı mesajı şablonu, önce düşün sonra ```sql``` bloğu
    (OmniSQL/SynSQL türü veriyle eğitilmiş modeller bu biçimde çok daha iyi çalışır)."""
    stem = "text2sql_cot" if style == "cot" else "text2sql"
    name = f"{stem}.md" if lang == "tr" else f"{stem}_{lang}.md"
    p = PROMPTS_DIR / name
    if not p.exists():
        p = PROMPTS_DIR / f"{stem}.md"
    text = p.read_text(encoding="utf-8")
    return re.sub(
        r"^\s*<!--.*?-->\s*", "", text, flags=re.DOTALL
    ).strip()  # dosya başı açıklaması modele gitmez


def parse_output(raw: Any) -> tuple[str, str]:
    """Model çıktısından (sql, explanation). JSON, ```sql``` bloğu veya düz SQL kabul edilir."""
    if isinstance(raw, dict):
        return str(raw.get("sql") or "").strip(), str(raw.get("explanation") or "").strip()
    text = _THINK_RE.sub("", str(raw or "")).strip()
    if not text:
        return "", ""
    try:
        from ..runtimes.llm import extract_json

        obj = extract_json(text)
    except Exception:  # noqa: BLE001
        obj = None
    if isinstance(obj, dict) and obj.get("sql"):
        return str(obj["sql"]).strip(), str(obj.get("explanation") or "").strip()
    sql = _last_sql_block(text)
    if sql:
        return sql, ""
    if re.match(r"^\s*(with|select)\b", text, re.IGNORECASE):
        return text.strip().rstrip(";"), ""
    return "", ""


def _signature(rows: Any) -> tuple:
    """Sonuç kümesinin sıradan bağımsız imzası (BIRD değerlendirmesiyle aynı mantık: küme eşitliği)."""
    try:
        return tuple(sorted({tuple(_norm(v) for v in r) for r in rows}, key=repr))
    except TypeError:
        return (repr(rows),)


def _norm(v: Any) -> Any:
    if isinstance(v, float):
        return round(v, 6)
    return v


async def _maybe_await(x: Any) -> Any:
    if inspect.isawaitable(x):
        return await x
    return x


class Text2SQL:
    def __init__(
        self,
        generate: Generator,
        *,
        executor: Executor | None = None,
        security: Security | None = None,
        dialect: str | None = None,
        lang: str = "tr",
        max_repairs: int = 2,
        candidates: int = 1,
        sample_temperature: float = 0.6,
        link: bool = True,
        max_tables: int = 6,
        max_columns_per_table: int = 12,
        empty_result_is_error: bool = False,
        system_extra: str = "",
        style: str = "json",
    ) -> None:
        if style not in STYLES:
            raise ValueError(f"style {STYLES} içinden olmalı: {style}")
        self.style = style
        self.generate = generate
        self.executor = executor
        self.security = security
        self.dialect = dialect
        self.lang = lang
        self.max_repairs = max(0, int(max_repairs))
        self.candidates = max(1, int(candidates))
        self.sample_temperature = sample_temperature
        self.link = link
        self.max_tables = max_tables
        self.max_columns_per_table = max_columns_per_table
        self.empty_result_is_error = empty_result_is_error
        self.system_extra = system_extra

    # ------------------------------------------------------------------ istem
    def prompt_schema(
        self, index: SchemaIndex, question: str, evidence: str = ""
    ) -> tuple[SchemaIndex, list[str]]:
        if self.link and len(index.tables) > self.max_tables:
            res = link_schema(
                index,
                question,
                evidence,
                max_tables=self.max_tables,
                max_columns_per_table=self.max_columns_per_table,
            )
            return res.schema(index), res.tables
        return index, index.table_names

    def messages_for(self, index: SchemaIndex, question: str, evidence: str = "") -> list[dict]:
        """Eğitim verisi hazırlayan betik de aynı biçimi kullanır (eğitim = çıkarım istemi)."""
        schema_idx, _ = self.prompt_schema(index, question, evidence)
        d = self.dialect or index.dialect
        schema_text = schema_idx.to_prompt(dialect=d)
        en = self.lang == "en"
        if self.style == "cot":
            label = "External knowledge" if en else "İpucu"
            q = f"{label}: {evidence}\n{question}" if evidence else question
            engine = {
                "sqlite": "SQLite",
                "postgres": "PostgreSQL",
                "mysql": "MySQL",
                "tsql": "SQL Server",
            }.get(d or "", d or "SQL")
            body = load_prompt(self.lang, "cot").format(engine=engine, schema=schema_text, question=q)
            if self.system_extra:
                body += "\n\n" + self.system_extra
            return [{"role": "user", "content": body}]
        system = load_prompt(self.lang)
        if d:
            system += f"\n\n{'SQL dialect' if en else 'SQL lehçesi'}: {d}."
        if self.system_extra:
            system += "\n\n" + self.system_extra
        if en:
            user = f"SCHEMA:\n{schema_text}\n"
            if evidence:
                user += f"\nEVIDENCE (treat as true, apply literally): {evidence}\n"
            user += f"\nQUESTION: {question}"
        else:
            user = f"ŞEMA:\n{schema_text}\n"
            if evidence:
                user += f"\nİPUCU (doğru kabul et, aynen uygula): {evidence}\n"
            user += f"\nSORU: {question}"
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def assistant_echo(self, sql: str, explanation: str = "") -> str:
        """Düzeltme turunda modelin önceki yanıtı (uzun akıl yürütme yerine yalnız sorgusu)."""
        if self.style == "cot":
            return f"```sql\n{sql}\n```"
        return json.dumps({"sql": sql, "explanation": explanation}, ensure_ascii=False)

    @staticmethod
    def repair_message(error: str, lang: str = "tr", style: str = "json") -> str:
        """Düzeltme turunda modele giden metin; eğitim verisi (prepare_bird_sft.py) aynı metni kullanır."""
        if style == "cot":
            if lang == "en":
                return (
                    f"The previous query was rejected: {error}\n"
                    "Fix it using only tables and columns from the schema. Think briefly, then give the corrected "
                    "query in a ```sql code block."
                )
            return (
                f"Önceki sorgu reddedildi: {error}\n"
                "Yalnız şemadaki tablo ve sütunlarla düzelt. Kısaca düşün, düzeltilmiş sorguyu ```sql bloğunda ver."
            )
        if lang == "en":
            return (
                f"The previous query was rejected: {error}\n"
                "Write the corrected query in the same JSON format, using only tables and columns from the schema."
            )
        return (
            f"Önceki sorgu reddedildi: {error}\n"
            "Yalnız şemadaki tablo ve sütunları kullanarak düzeltilmiş sorguyu aynı JSON biçiminde yaz."
        )

    # ------------------------------------------------------------------ tek aday
    async def _one_candidate(
        self,
        base_messages: list[dict],
        index: SchemaIndex,
        temperature: float,
        attempts: list[dict],
        cand_no: int,
    ) -> dict | None:
        messages = list(base_messages)
        d = self.dialect or index.dialect
        last_error = None
        for turn in range(self.max_repairs + 1):
            raw = await self.generate(messages, temperature)
            sql, explanation = parse_output(raw)
            rec: dict[str, Any] = {"candidate": cand_no, "turn": turn, "sql": sql, "ok": False}
            attempts.append(rec)
            error = None
            grounded: Grounded | None = None
            rows = None
            if not sql:
                error = (
                    'Boş veya ayrıştırılamayan yanıt; yalnız {"sql": ..., "explanation": ...} JSON\'u döndür.'
                )
            else:
                try:
                    if self.security is not None:
                        sql = self.security(sql)
                        rec["sql"] = sql
                    grounded = ground(sql, index, d)
                    rec["tables"], rec["columns"] = grounded.tables, grounded.columns
                    if self.executor is not None:
                        rows = await _maybe_await(self.executor(sql))
                        rec["row_count"] = len(rows) if rows is not None else None
                        if self.empty_result_is_error and not rows:
                            error = (
                                "Sorgu çalıştı ama hiç satır dönmedi. Filtre değerlerini şemadaki örnek değerlerle "
                                "karşılaştır (büyük/küçük harf, boşluk, tam eşleşme) ve gerekiyorsa düzelt."
                            )
                except GroundingError as e:
                    error = e.message
                    rec["error_kind"] = "grounding"
                except Exception as e:  # noqa: BLE001 - güvenlik denetimi / veritabanı hatası
                    error = getattr(e, "message", None) or str(e)
                    rec["error_kind"] = rec.get("error_kind") or (
                        "security" if grounded is None else "execution"
                    )
            if error is None:
                rec["ok"] = True
                return {
                    "sql": sql,
                    "explanation": explanation,
                    "grounded": grounded,
                    "rows": rows,
                    "candidate": cand_no,
                    "turn": turn,
                }
            rec["error"] = error
            last_error = error
            if turn < self.max_repairs:
                messages = messages + [
                    {
                        "role": "assistant",
                        "content": self.assistant_echo(sql, explanation),
                    },
                    {"role": "user", "content": self.repair_message(error, self.lang, self.style)},
                ]
        attempts.append({"candidate": cand_no, "gave_up": True, "error": last_error})
        return None

    # ------------------------------------------------------------------ ana giriş
    async def run(self, question: str, index: SchemaIndex, evidence: str = "") -> Text2SQLResult:
        base = self.messages_for(index, question, evidence)
        _, linked = self.prompt_schema(index, question, evidence)
        attempts: list[dict] = []
        valid: list[dict] = []
        for i in range(self.candidates):
            temp = 0.0 if i == 0 else self.sample_temperature
            cand = await self._one_candidate(base, index, temp, attempts, i)
            if cand is not None:
                valid.append(cand)
        if not valid:
            last = next((a.get("error") for a in reversed(attempts) if a.get("error")), "bilinmeyen hata")
            raise Text2SQLError(f"Geçerli SQL üretilemedi: {last}", attempts)

        selected_by = "greedy"
        chosen = valid[0]
        if len(valid) > 1:
            if self.executor is not None:
                groups: dict[tuple, list[dict]] = {}
                for c in valid:
                    groups.setdefault(_signature(c["rows"]), []).append(c)
                best = max(groups.values(), key=lambda g: (len(g), -g[0]["candidate"]))
                chosen = best[0]
                selected_by = "vote" if len(groups) > 1 or len(best) > 1 else "greedy"
            else:
                selected_by = "only_valid" if valid[0]["candidate"] != 0 else "greedy"
        elif self.candidates > 1:
            selected_by = "only_valid"

        g: Grounded = chosen["grounded"]
        return Text2SQLResult(
            sql=chosen["sql"],
            explanation=chosen["explanation"],
            tables=g.tables,
            columns=g.columns,
            attempts=attempts,
            candidates=self.candidates,
            selected_by=selected_by,
            linked_tables=linked,
            rows=chosen["rows"],
        )
