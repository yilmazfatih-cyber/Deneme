"""Aşama 1 — Kalıcı hafıza: oturum veritabanı (SQLite + FTS5) ve küratörlü hafıza dosyaları.

Gerçek karşılıkları (NousResearch/hermes-agent):
  - hermes_state.py + hermes_state_fts.py + hermes_state_schema.py → SessionDB, messages_fts (FTS5)
  - tools/session_search_tool.py                                    → geçmiş konuşmalarda arama
  - tools/memory_tool.py + tools/memory_tool_store.py              → MEMORY.md / USER.md
  - tools/threat_patterns.py                                        → enjeksiyon/sızdırma kalıpları

İki tür hafıza vardır ve farkı önemlidir:
  * Bildirimsel, küratörlü hafıza (MEMORY.md = ajanın notları, USER.md = kullanıcı profili):
    küçük, karakter sınırlı, oturum başında sistem istemine DONDURULMUŞ olarak girer.
  * Epizodik hafıza (SessionDB): tüm mesajlar diskte durur, istem dışındadır; gerekince
    session_search aracıyla tam metin aranır.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

ENTRY_DELIMITER = "\n§\n"  # gerçek depodakiyle aynı ayraç: girdiler arasında '§' satırı

_ARA = r"(?:\w+\s+){0,8}"  # anahtar kelimeler arasında sınırlı dolgu (sınırsız olursa regex patlar)
TEHDIT_KALIPLARI = [
    (rf"ignore\s+{_ARA}(previous|all|above|prior)\s+{_ARA}instructions", "prompt_injection"),
    (r"system\s+prompt\s+override", "sys_prompt_override"),
    (rf"(önceki|tüm|bütün)\s+{_ARA}talimatları\s+(yok\s+say|unut|görmezden\s+gel)", "prompt_injection_tr"),
    (r"(curl|wget)\s+[^\n]{0,200}\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD)", "exfil_curl"),
    (r"<!--[^>]{0,200}(ignore|override|system|secret)[^>]{0,200}-->", "html_comment_injection"),
]


def tehdit_tara(metin: str) -> str | None:
    """Eşleşen ilk kalıbın kimliğini döndürür. Bu bir SINIR değil, sezgisel bir uyarıdır."""
    for kalip, kimlik in TEHDIT_KALIPLARI:
        if re.search(kalip, metin[:65536], re.IGNORECASE):
            return kimlik
    return None


def atomik_yaz(yol: Path, metin: str) -> None:
    """Önce geçici dosyaya yaz, sonra yerine taşı: yarım yazılmış dosya kalmaz."""
    yol.parent.mkdir(parents=True, exist_ok=True)
    fd, gecici = tempfile.mkstemp(dir=yol.parent, prefix=f".{yol.name}.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(metin)
    os.replace(gecici, yol)


# --------------------------------------------------------------------------- oturum veritabanı
def fts5_destekleniyor() -> bool:
    try:
        sqlite3.connect(":memory:").execute("CREATE VIRTUAL TABLE t USING fts5(x)")
        return True
    except sqlite3.OperationalError:
        return False


class SessionDB:
    """Tüm konuşmaların kalıcı kaydı. FTS5 yoksa LIKE tabanlı yedek aramaya düşer."""

    def __init__(self, yol: str | Path = ":memory:", use_fts: bool | None = None):
        self.db = sqlite3.connect(str(yol), check_same_thread=False)
        self.use_fts = fts5_destekleniyor() if use_fts is None else use_fts
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL, ended_at REAL);
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
                content TEXT, tool_name TEXT, tool_calls TEXT, tool_call_id TEXT, ts REAL);
            """)
        if self.use_fts:
            # Dış içerikli FTS5 dizini + tetikleyiciler: metin bir kez saklanır, dizin senkron kalır.
            self.db.executescript("""
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
                    USING fts5(content, content='messages', content_rowid='id');
                CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content); END;
                CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content); END;
                """)

    def create_session(self, source: str = "cli", session_id: str | None = None) -> str:
        sid = session_id or f"{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
        self.db.execute("INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, NULL)", (sid, source, time.time()))
        self.db.commit()
        return sid

    def end_session(self, session_id: str) -> None:
        self.db.execute("UPDATE sessions SET ended_at = ? WHERE id = ?", (time.time(), session_id))
        self.db.commit()

    def append_message(self, session_id: str, mesaj: dict[str, Any]) -> int:
        imlec = self.db.execute(
            "INSERT INTO messages (session_id, role, content, tool_name, tool_calls, tool_call_id, ts)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                session_id,
                mesaj["role"],
                mesaj.get("content") or "",
                mesaj.get("name"),
                json.dumps(mesaj["tool_calls"], ensure_ascii=False) if mesaj.get("tool_calls") else None,
                mesaj.get("tool_call_id"),
                time.time(),
            ),
        )
        self.db.commit()
        return int(imlec.lastrowid)

    def get_messages(self, session_id: str) -> list[dict[str, Any]]:
        """OpenAI biçiminde geçmiş (gateway bir sonraki turda bunu yeniden yükler)."""
        sonuc = []
        for rol, icerik, ad, cagrilar, cid in self.db.execute(
            "SELECT role, content, tool_name, tool_calls, tool_call_id FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        ):
            mesaj: dict[str, Any] = {"role": rol, "content": icerik}
            if cagrilar:
                mesaj["tool_calls"] = json.loads(cagrilar)
            if rol == "tool":
                mesaj["name"], mesaj["tool_call_id"] = ad, cid
            sonuc.append(mesaj)
        return sonuc

    def search(self, sorgu: str, limit: int = 5, exclude_session_ids: tuple[str, ...] = ()) -> list[dict[str, Any]]:
        """Tam metin arama. Zamanlanmış (cron) oturumlar sona itilir: kendi sohbetlerin önce gelsin."""
        terimler = re.findall(r"\w+", sorgu.lower())
        if not terimler:
            return []
        if self.use_fts:
            fts_sorgu = " OR ".join(f'"{t}"' for t in terimler)  # tırnak: FTS5 sözdizimi enjeksiyonu olmasın
            satirlar = self.db.execute(
                """SELECT m.id, m.session_id, m.role, m.content, s.source, bm25(messages_fts) AS skor
                   FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
                   JOIN sessions s ON s.id = m.session_id
                   WHERE messages_fts MATCH ? ORDER BY (s.source = 'cron'), skor LIMIT ?""",
                (fts_sorgu, limit * 4),
            ).fetchall()
        else:
            kosul = " OR ".join("lower(m.content) LIKE ?" for _ in terimler)
            ham = self.db.execute(
                f"""SELECT m.id, m.session_id, m.role, m.content, s.source FROM messages m
                    JOIN sessions s ON s.id = m.session_id WHERE {kosul}""",
                [f"%{t}%" for t in terimler],
            ).fetchall()
            # bm25 yok: eşleşen terim sayısını negatif skor yap (küçük skor = iyi, FTS5 ile aynı yön)
            satirlar = sorted(
                ((*s, -sum(s[3].lower().count(t) for t in terimler)) for s in ham), key=lambda s: (s[4] == "cron", s[5])
            )
        sonuc = []
        for mid, sid, rol, icerik, kaynak, _skor in satirlar:
            if sid in exclude_session_ids or rol == "tool":
                continue
            sonuc.append({"message_id": mid, "session_id": sid, "role": rol, "source": kaynak, "snippet": icerik[:200]})
            if len(sonuc) == limit:
                break
        return sonuc


# --------------------------------------------------------------------------- küratörlü hafıza
class MemoryStore:
    """MEMORY.md (ajanın notları) ve USER.md (kullanıcı profili). Varsayılan sınırlar gerçek
    depodakiyle aynı: 2200 ve 1375 karakter. Sınır, hafızayı 'özetlemeye' zorlar."""

    DOSYALAR = {"memory": "MEMORY.md", "user": "USER.md"}

    def __init__(self, home: Path, memory_char_limit: int = 2200, user_char_limit: int = 1375):
        self.klasor = Path(home) / "memories"
        self.sinirlar = {"memory": memory_char_limit, "user": user_char_limit}

    def entries(self, hedef: str) -> list[str]:
        yol = self.klasor / self.DOSYALAR[hedef]
        if not yol.exists():
            return []
        return [g.strip() for g in yol.read_text(encoding="utf-8").split(ENTRY_DELIMITER) if g.strip()]

    def _kaydet(self, hedef: str, girdiler: list[str]) -> dict[str, Any]:
        metin = ENTRY_DELIMITER.join(girdiler)
        if len(metin) > self.sinirlar[hedef]:
            return {
                "success": False,
                "error": f"{self.DOSYALAR[hedef]} sınırı ({self.sinirlar[hedef]} karakter) aşılır; "
                "önce eski girdileri birleştir ya da sil",
            }
        atomik_yaz(self.klasor / self.DOSYALAR[hedef], metin)
        return {"success": True, "entries": len(girdiler), "chars": len(metin)}

    def apply(self, action: str, hedef: str = "memory", content: str = "", old_text: str = "") -> dict[str, Any]:
        if hedef not in self.DOSYALAR:
            return {"success": False, "error": f"bilinmeyen hedef: {hedef}"}
        if content and (tehdit := tehdit_tara(content)):
            # hafıza her oturumda sisteme girer: zehirli bir girdi kalıcı olurdu, o yüzden reddet
            return {"success": False, "error": f"içerik güvenlik taramasına takıldı ({tehdit})"}
        girdiler = self.entries(hedef)
        if action == "add":
            if not content.strip():
                return {"success": False, "error": "boş girdi eklenemez"}
            return self._kaydet(hedef, girdiler + [content.strip()])
        eslesen = [i for i, g in enumerate(girdiler) if old_text and old_text in g]
        if len(eslesen) != 1:
            return {"success": False, "error": f"old_text tam olarak bir girdiyle eşleşmeli ({len(eslesen)} eşleşme)"}
        if action == "replace":
            girdiler[eslesen[0]] = content.strip()
        elif action == "remove":
            girdiler.pop(eslesen[0])
        else:
            return {"success": False, "error": f"bilinmeyen eylem: {action}"}
        return self._kaydet(hedef, girdiler)

    def snapshot(self) -> str:
        """Oturum başında bir kez alınır; oturum boyunca DEĞİŞMEZ (istem önbelleği bozulmasın)."""
        bloklar = []
        for hedef, baslik in (("memory", "AJANIN NOTLARI (MEMORY.md)"), ("user", "KULLANICI PROFİLİ (USER.md)")):
            girdiler = self.entries(hedef)
            if girdiler:
                bloklar.append(f"## {baslik}\n" + "\n".join(f"- {g}" for g in girdiler))
        return "\n\n".join(bloklar)
