"""Aşama 5 — Mesajlaşma geçidi (gateway): platform bağdaştırıcıları, oturum anahtarı, DM eşleştirme.

Gerçek karşılıkları: gateway/run.py (GatewayRunner), gateway/session.py (SessionSource,
build_session_key), gateway/platforms/base.py (BasePlatformAdapter), gateway/pairing.py
(DM eşleştirme kodları), plugins/platforms/<telegram|discord|slack|…>/adapter.py.

Akış: bağdaştırıcı platformdan mesaj alır → MessageEvent üretir → geçit yetkiyi denetler →
oturum anahtarını hesaplar → o anahtarın ajanını (önbellekten) bulur → cevabı aynı kanala yollar.
"""

from __future__ import annotations

import json
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O ve 1/I yok: sesli okununca karışmasın
KOD_UZUNLUGU, KOD_OMRU, ISTEK_ARALIGI, PLATFORM_BASINA_BEKLEYEN = 8, 3600, 600, 3


@dataclass
class SessionSource:
    platform: str
    chat_id: str
    user_id: str
    chat_type: str = "dm"  # dm | group
    thread_id: str | None = None
    user_name: str = ""


@dataclass
class MessageEvent:
    source: SessionSource
    text: str


def build_session_key(source: SessionSource, group_sessions_per_user: bool = True, profile: str | None = None) -> str:
    """Deterministik oturum anahtarı: agent:<profil>:<platform>:<sohbet türü>:<sohbet>[:<konu>][:<kişi>].
    DM'ler sohbet başına ayrıdır; grupta varsayılan olarak her kişinin ayrı oturumu olur."""
    parcalar = [f"agent:{profile or 'main'}", source.platform, source.chat_type, source.chat_id]
    if source.thread_id:
        parcalar.append(source.thread_id)
    if source.chat_type != "dm" and group_sessions_per_user and not source.thread_id:
        parcalar.append(source.user_id)
    return ":".join(parcalar)


class PairingStore:
    """Bilinmeyen kişiye tek kullanımlık kod verilir; sahibi CLI'dan onaylar. Kodlar loglanmaz."""

    def __init__(self, home: Path, saat: Callable[[], float] = time.time):
        self.yol = Path(home) / "pairing" / "pairing.json"
        self.saat = saat
        self.veri = (
            json.loads(self.yol.read_text(encoding="utf-8")) if self.yol.exists() else {"pending": {}, "approved": {}}
        )

    def _kaydet(self) -> None:
        self.yol.parent.mkdir(parents=True, exist_ok=True)
        self.yol.write_text(json.dumps(self.veri, ensure_ascii=False), encoding="utf-8")
        os.chmod(self.yol, 0o600)  # yalnızca sahibi okuyabilsin

    def _temizle(self) -> None:
        simdi = self.saat()
        self.veri["pending"] = {k: v for k, v in self.veri["pending"].items() if v["expires"] > simdi}

    def is_approved(self, platform: str, user_id: str) -> bool:
        return user_id in self.veri["approved"].get(platform, [])

    def request_code(self, platform: str, user_id: str) -> str | None:
        """Yeni kod üretir; aynı kişiye 10 dakikada bir, platform başına en çok 3 bekleyen kod."""
        self._temizle()
        simdi = self.saat()
        for bekleyen in self.veri["pending"].values():
            if bekleyen["platform"] == platform and bekleyen["user_id"] == user_id:
                if simdi - bekleyen["created"] < ISTEK_ARALIGI:
                    return None  # hız sınırı: yeni kod yok
        if sum(1 for b in self.veri["pending"].values() if b["platform"] == platform) >= PLATFORM_BASINA_BEKLEYEN:
            return None
        kod = "".join(secrets.choice(ALFABE) for _ in range(KOD_UZUNLUGU))
        self.veri["pending"][kod] = {
            "platform": platform,
            "user_id": user_id,
            "created": simdi,
            "expires": simdi + KOD_OMRU,
        }
        self._kaydet()
        return kod

    def approve(self, platform: str, kod: str) -> str | None:
        self._temizle()
        bekleyen = self.veri["pending"].get(kod.strip().upper())
        if not bekleyen or bekleyen["platform"] != platform:
            return None
        del self.veri["pending"][kod.strip().upper()]
        self.veri["approved"].setdefault(platform, []).append(bekleyen["user_id"])
        self._kaydet()
        return bekleyen["user_id"]


class BasePlatformAdapter(ABC):
    """Her platformun yapması gereken üç şey: bağlan, gelen mesajı bildir, cevap gönder."""

    name = "base"

    def __init__(self) -> None:
        self.handler: Callable[[MessageEvent], None] | None = None

    def connect(self, handler: Callable[[MessageEvent], None]) -> None:
        self.handler = handler

    @abstractmethod
    def send(self, chat_id: str, text: str) -> None: ...


class InMemoryAdapter(BasePlatformAdapter):
    """CLI ya da 'sahte Telegram' gibi davranan bellek içi bağdaştırıcı (testler ağsız çalışsın)."""

    def __init__(self, name: str):
        super().__init__()
        self.name = name
        self.outbox: list[tuple[str, str]] = []

    def simulate(
        self, chat_id: str, user_id: str, text: str, chat_type: str = "dm", thread_id: str | None = None
    ) -> None:
        if self.handler is None:
            raise RuntimeError("bağdaştırıcı geçide bağlanmadı")
        self.handler(MessageEvent(SessionSource(self.name, chat_id, user_id, chat_type, thread_id), text))

    def send(self, chat_id: str, text: str) -> None:
        self.outbox.append((chat_id, text))


class GatewayRunner:
    """Tek süreç, çok platform. agent_factory(session_key, source) yeni bir ajan üretir."""

    def __init__(
        self, home: Path, agent_factory: Callable[[str, SessionSource], Any], allowed_users: dict | None = None
    ):
        self.home = Path(home)
        self.agent_factory = agent_factory
        self.allowed_users = allowed_users or {}  # {"telegram": ["123"]}: statik izin listesi
        self.pairing = PairingStore(self.home)
        self.adapters: dict[str, BasePlatformAdapter] = {}
        self.agents: dict[str, Any] = {}  # oturum anahtarı → ajan (sistem istemi önbelleği korunur)

    def add_adapter(self, adapter: BasePlatformAdapter) -> None:
        self.adapters[adapter.name] = adapter
        adapter.connect(self.handle_message)

    def is_authorized(self, source: SessionSource) -> bool:
        if source.platform == "cli":
            return True  # yerel terminal sahibin kendisidir
        return source.user_id in self.allowed_users.get(source.platform, []) or self.pairing.is_approved(
            source.platform, source.user_id
        )

    def handle_message(self, event: MessageEvent) -> None:
        kaynak, adapter = event.source, self.adapters[event.source.platform]
        if not self.is_authorized(kaynak):
            if kaynak.chat_type == "dm" and (kod := self.pairing.request_code(kaynak.platform, kaynak.user_id)):
                adapter.send(
                    kaynak.chat_id,
                    f"Merhaba! Erişim için sahibin şu komutu çalıştırması gerek: "
                    f"hermes pairing approve {kaynak.platform} {kod}",
                )
            return  # mesaj ajana HİÇ ulaşmaz
        anahtar = build_session_key(kaynak)
        if event.text.strip() == "/new":  # oturumu sıfırla: yeni ajan, yeni sistem istemi
            self.agents.pop(anahtar, None)
            adapter.send(kaynak.chat_id, "Yeni oturum başladı.")
            return
        ajan = self.agents.get(anahtar)
        if ajan is None:
            ajan = self.agents[anahtar] = self.agent_factory(anahtar, kaynak)
        adapter.send(kaynak.chat_id, ajan.chat(event.text))

    def deliver(self, platform: str, chat_id: str, text: str) -> bool:
        """Zamanlanmış işlerin çıktısını herhangi bir platforma iletir (aşama 6)."""
        adapter = self.adapters.get(platform)
        if adapter is None:
            return False
        adapter.send(chat_id, text)
        return True
