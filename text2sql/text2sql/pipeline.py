"""Soru -> şema -> istem -> model -> SQL çıkarma -> (salt okunur) çalıştırma; hata olursa modele geri besleme."""

from __future__ import annotations

from dataclasses import dataclass, field

from .errors import ExecutionError, ReadOnlyError, SQLNotFoundError
from .prompt import approx_tokens, build_messages, fix_messages
from .run import QueryResult, execute
from .schema import Schema, detect_dialect, extract_schema
from .sqlutil import ensure_read_only, extract_statements, write_reason


@dataclass
class Answer:
    question: str
    sql: str = ""
    result: QueryResult | None = None
    attempts: int = 0
    error: str = ""
    notes: list[str] = field(default_factory=list)
    raw_replies: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = {"soru": self.question, "sql": self.sql, "deneme": self.attempts}
        if self.result is not None:
            d["sutunlar"] = self.result.columns
            d["satirlar"] = [list(r) for r in self.result.rows]
            d["kesildi"] = self.result.truncated
            if self.result.rowcount is not None:
                d["etkilenen_satir"] = self.result.rowcount
        if self.error:
            d["hata"] = self.error
        if self.notes:
            d["notlar"] = self.notes
        return d


class Text2SQL:
    """Bir veritabanına bağlı soru-cevap hattı. Şema bir kez çıkarılır, her soruda yeniden kullanılır."""

    def __init__(self, backend, db: str, dialect: str | None = None, sample_rows: int = 2, tables: list[str] | None = None,
                 examples: list[tuple[str, str]] | None = None, num_ctx: int = 4096) -> None:
        self.backend = backend
        self.db = db
        self.db_dialect = detect_dialect(db)  # çalıştırma ve okuma denetimi için: her zaman adresten
        self.dialect = dialect or self.db_dialect  # istem ve SQL ayıklama için (--lehce)
        self.schema: Schema = extract_schema(db, sample_rows=sample_rows, tables=tables)
        self.schema.dialect = self.dialect
        self.ddl = self.schema.to_ddl()
        self.examples = examples or []
        self.num_ctx = num_ctx

    def messages(self, question: str, history: list[tuple[str, str]] | None = None) -> list[dict]:
        return build_messages(question, self.ddl, self.dialect, self.examples, history)

    def ask(self, question: str, *, execute_sql: bool = True, write: bool = False, retries: int = 1, limit: int = 200,
            query_timeout: float = 30.0, history: list[tuple[str, str]] | None = None) -> Answer:
        """Hata türleri: model/sunucu hatası (BackendError) yukarı fırlatılır; SQL bulunamazsa, çalıştırma
        hatası olursa ``retries`` kez modele geri beslenir; yazma sorgusu --yaz olmadan ReadOnlyError fırlatır."""
        ans = Answer(question)
        messages = self.messages(question, history)
        if approx_tokens(messages) > self.num_ctx * 0.8:
            ans.notes.append(f"İstem bağlam penceresine ({self.num_ctx}) yakın; --tablolar ile şemayı daraltın ya da --ornek-satir 0 verin.")
        for attempt in range(retries + 1):
            ans.attempts = attempt + 1
            reply = self.backend.chat(messages)
            ans.raw_replies.append(reply)
            try:
                stmts = extract_statements(reply, self.dialect)
            except SQLNotFoundError as exc:
                ans.sql, ans.error = "", str(exc)
                messages = fix_messages(messages, reply, "No SQL statement found in your reply.")
                continue
            sql = stmts[0]
            if len(stmts) > 1:
                ans.notes.append("Modelin yanıtında birden çok ifade vardı; yalnızca ilki alındı.")
            ans.sql = sql
            ans.error = ""
            reason = None if write else write_reason(sql, self.db_dialect)
            if not execute_sql:
                if reason:
                    ans.notes.append(f"Bu sorgu veriyi değiştirir ({reason}); çalıştırmak için --yaz gerekir.")
                return ans
            if reason:
                ensure_read_only(sql, self.db_dialect)  # yeniden denemeye değmez: kullanıcıya açık mesaj (SQL ile)
            try:
                ans.result = execute(self.db, sql, write=write, limit=limit, timeout=query_timeout)
                return ans
            except ReadOnlyError:
                raise
            except ExecutionError as exc:
                ans.error = str(exc)
                messages = fix_messages(messages, reply, str(exc))
        return ans
