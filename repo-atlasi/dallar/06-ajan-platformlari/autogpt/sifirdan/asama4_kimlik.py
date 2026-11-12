"""Aşama 4 — Kimlik bilgileri (credentials) soyutlaması + kimlik isteyen bir LLM bloğu.

Gerçek karşılığı: autogpt_platform/backend/backend/data/model.py (APIKeyCredentials,
CredentialsMetaInput), integrations/credentials_store.py, integrations/creds_manager.py,
util/encryption.py (Fernet ile şifreleme).

Kural: graf JSON'unda ve yürütme kayıtlarında YALNIZCA referans durur
({"id": ..., "provider": ...}). Gizli anahtar, düğüm çalışmadan hemen önce depodan
çözülür ve run()'a ayrı bir kwarg olarak verilir; hiçbir zaman node_io tablosuna yazılmaz.

Not: Python standart kütüphanesinde AES/Fernet yok. Bu mini sürüm anahtarı sqlite'ta düz
metin tutar ve bunu açıkça söyler; üretimde şifrelemeden (gerçekte Fernet) asla saklama.
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from typing import Any

from asama1_blok import Block, BlockSchema, BlockSchemaOutput, BlockType, SchemaField


class Secret:
    """repr/str içinde asla görünmeyen değer (gerçekte pydantic.SecretStr)."""

    def __init__(self, deger: str):
        self._deger = deger

    def get_secret_value(self) -> str:
        return self._deger

    def __repr__(self) -> str:
        return "Secret('**********')"

    __str__ = __repr__


@dataclass(frozen=True)
class APIKeyCredentials:
    id: str
    user_id: str
    provider: str
    api_key: Secret
    title: str = ""
    type: str = "api_key"

    def meta(self) -> dict[str, str]:
        """Grafa yazılabilecek tek biçim: gizli değer içermeyen referans."""
        return {"id": self.id, "provider": self.provider, "type": self.type, "title": self.title}


class CredentialsStore:
    def __init__(self, db: sqlite3.Connection | None = None):
        self.db = db or sqlite3.connect(":memory:")
        self.db.execute("""CREATE TABLE IF NOT EXISTS credentials (
                 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
                 title TEXT NOT NULL, secret TEXT NOT NULL)""")

    def add(self, user_id: str, provider: str, api_key: str, title: str = "") -> APIKeyCredentials:
        kimlik = APIKeyCredentials(str(uuid.uuid4()), user_id, provider, Secret(api_key), title)
        self.db.execute(
            "INSERT INTO credentials VALUES (?, ?, ?, ?, ?)", (kimlik.id, user_id, provider, title, api_key)
        )
        self.db.commit()
        return kimlik

    def get(self, user_id: str, cred_id: str) -> APIKeyCredentials | None:
        satir = self.db.execute(
            "SELECT id, user_id, provider, title, secret FROM credentials WHERE id = ? AND user_id = ?",
            (cred_id, user_id),
        ).fetchone()
        if not satir:
            return None
        return APIKeyCredentials(satir[0], satir[1], satir[2], Secret(satir[4]), satir[3])

    def list_meta(self, user_id: str, provider: str | None = None) -> list[dict[str, str]]:
        satirlar = self.db.execute(
            "SELECT id, provider, title FROM credentials WHERE user_id = ? AND (? IS NULL OR provider = ?)",
            (user_id, provider, provider),
        )
        return [{"id": i, "provider": p, "type": "api_key", "title": t} for i, p, t in satirlar]

    def resolver(self, blok: Block, girisler: dict[str, Any], user_id: str) -> dict[str, Any]:
        """Yürütücüye verilen çözücü: bloğun kimlik alanlarını gerçek nesnelere çevirir."""
        ek: dict[str, Any] = {}
        for alan, tanim in blok.input_schema.credentials_fields().items():
            meta = girisler.get(alan)
            if not isinstance(meta, dict) or "id" not in meta:
                raise LookupError(f"{blok.name}: '{alan}' için kimlik bilgisi seçilmemiş")
            kimlik = self.get(user_id, meta["id"])
            if kimlik is None:  # başka kullanıcının kimliği de "yok" görünür (bilgi sızdırmaz)
                raise PermissionError(f"{blok.name}: kimlik bilgisi bulunamadı ya da size ait değil")
            if kimlik.provider != tanim.credentials_provider:
                raise PermissionError(
                    f"{blok.name}: {tanim.credentials_provider} beklenirken {kimlik.provider} verildi"
                )
            ek[alan] = kimlik
        return ek


class FakeLLM:
    """Ağsız, deterministik sahte model: istemi ve hangi anahtarla çağrıldığını kaydeder."""

    def __init__(self, beklenen_anahtar: str, cevapla=None):
        self.beklenen_anahtar = beklenen_anahtar
        self.cevapla = cevapla or (lambda istem: f"[özet] {istem[:40]}")
        self.cagrilar: list[str] = []

    def complete(self, istem: str, api_key: str) -> str:
        if api_key != self.beklenen_anahtar:
            raise PermissionError("geçersiz API anahtarı")
        self.cagrilar.append(istem)
        return self.cevapla(istem)


class LLMCallBlock(Block):
    id = "44c0fa20-4e22-4b82-ac2e-af06348349a8"
    description = "Bir istemi (sahte) LLM sağlayıcısına gönderir; sağlayıcı anahtarı kimlik deposundan gelir."
    block_type = BlockType.AI

    class input_schema(BlockSchema):
        prompt = SchemaField(str, "Modele gönderilecek istem")
        credentials = SchemaField(dict, "Kimlik referansı {id, provider}", credentials_provider="fake_llm")

    class output_schema(BlockSchemaOutput):
        response = SchemaField(str, "Modelin cevabı")

    def run(self, input_data, *, credentials: APIKeyCredentials, execution_context=None, **kwargs):
        llm = execution_context.services["llm"]  # servisler dışarıdan enjekte edilir; testte FakeLLM
        try:
            yield "response", llm.complete(input_data["prompt"], api_key=credentials.api_key.get_secret_value())
        except PermissionError as hata:
            yield "error", str(hata)
