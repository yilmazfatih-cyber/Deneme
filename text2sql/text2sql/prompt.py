"""Modele giden mesajlar: sistem talimatı + lehçe + şema DDL'i + (isteğe bağlı) örnekler/geçmiş + soru.

Küçük kod modelleri İngilizce talimatı daha iyi izlediği için talimat İngilizcedir; sorunun
Türkçe olabileceği açıkça söylenir. SYSTEM_PROMPT, Modelfile'daki SYSTEM ile aynı tutulur
(bir test bunu denetler); Ollama'da istekteki sistem mesajı Modelfile'dakinin yerine geçer.
"""

from __future__ import annotations

from .schema import DIALECT_NAMES

SYSTEM_PROMPT = """You are a text-to-SQL assistant. You convert a question about a database into one SQL query.
Rules:
- Reply with exactly one SQL statement inside a ```sql code block. No explanations, no comments.
- Use only the tables and columns that appear in the given schema. Never invent names.
- Write SQL for the given dialect only.
- The question may be in Turkish. Keep text values (names, cities, statuses) exactly as they appear in the data.
- Prefer explicit JOINs on the foreign keys shown in the schema.
- If the question asks for a list, return the useful columns, not only ids."""

DIALECT_HINTS = {
    "sqlite": "SQLite: use strftime('%Y', col) / date('now') for dates, || for string concatenation, LIMIT n.",
    "postgresql": "PostgreSQL: use EXTRACT / date_trunc for dates, ILIKE for case-insensitive match, LIMIT n, double quotes for identifiers.",
    "mysql": "MySQL: use YEAR(col) / DATE_FORMAT for dates, CONCAT() for strings, LIMIT n, backticks for identifiers.",
}

FIX_TEMPLATE = (
    "The query failed with this database error:\n{error}\n"
    "Fix it. Use only tables and columns from the schema. Reply with one corrected SQL statement in a ```sql block."
)


def fence(sql: str) -> str:
    return "```sql\n" + sql.strip().rstrip(";") + ";\n```"


def build_messages(
    question: str,
    schema_ddl: str,
    dialect: str,
    examples: list[tuple[str, str]] | None = None,
    history: list[tuple[str, str]] | None = None,
) -> list[dict]:
    """Ollama / OpenAI biçiminde mesaj listesi.

    examples: (soru, sql) çiftleri; kullanıcının kendi veritabanı için yazdığı örnekler (--ornekler).
    history : sohbet modunda önceki (soru, sql) çiftleri, eskiden yeniye.
    """
    name = DIALECT_NAMES.get(dialect, dialect)
    system = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Dialect: {name}\n{DIALECT_HINTS.get(dialect, '')}\n\n"
        f"Schema:\n```sql\n{schema_ddl.strip()}\n```"
    )
    messages = [{"role": "system", "content": system}]
    for q, sql in list(examples or []) + list(history or []):
        messages.append({"role": "user", "content": f"Question: {q}"})
        messages.append({"role": "assistant", "content": fence(sql)})
    messages.append({"role": "user", "content": f"Question: {question.strip()}"})
    return messages


def fix_messages(messages: list[dict], reply: str, error: str) -> list[dict]:
    """Hata geri beslemesi: modelin önceki yanıtı + hata mesajı eklenir."""
    return messages + [
        {"role": "assistant", "content": reply},
        {"role": "user", "content": FIX_TEMPLATE.format(error=error.strip()[:800])},
    ]


def approx_tokens(messages: list[dict]) -> int:
    """Kaba belirteç tahmini (≈ 3,5 karakter / belirteç); bağlam uyarısı için."""
    return int(sum(len(m["content"]) for m in messages) / 3.5)
