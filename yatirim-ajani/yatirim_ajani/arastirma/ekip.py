"""Ajan ekibi: baş (Fable 5.1) planlar ve dağıtır; analist (Opus 5.5), mühendis (Sonnet 5.5) ve
stajyer (Haiku 5.5) alt görevleri yapar. Haftada bir oturum; çıktı hisse başına tez listesi.

Bütçe ilkesi: pahalı model az konuşur. Baş yalnız plan, dağıtım ve son karar için çalışır;
veri toplama ve haber özeti stajyere, değerleme analiste, test/özellik işi mühendise gider.
Her alt görev tek bir API çağrısı zinciridir (araç kullanabilir) ve metin döndürür.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

import anthropic
from pydantic import BaseModel, Field, ValidationError

from ..ayarlar import AjanAyarlari, Piyasa
from ..veri.zaman_kilidi import ZamanKilitliVeri
from .ajan import AjanHatasi, ArastirmaSonucu, tez_kaydet
from .araclar import AracKutusu
from .sema import TEZ_SEMASI, TezCiktisi

ROLLER = {
    "analist": (
        "Kıdemli hisse analistisin. Değerleme yapar, tez yazarsın: karar (AL/TUT/SAT/IZLE), olasılık, ufuk, "
        "eşik getiri, adil değer aralığı, gerekçe, riskler. Gerekçede YÖNETİM KALİTESİNİ ayrı bir başlık olarak "
        "değerlendir: ana ortak ve yönetim kim, geçmiş sicili, sermaye tahsisi, azınlık hissedara tutum, "
        "KAP'ta açıklama disiplini. Aşırı güvenden kaçın; 0,65 üstü olasılık için somut kanıt iste."
    ),
    "muhendis": (
        "Kantitatif mühendissin. Eğitim sonuçlarını, ödül günlüğünü ve geriye test çıktısını yorumlarsın; "
        "aşırı uyum, sızıntı ve maliyet erimesi belirtilerini ararsın. Sayılarla konuş, kesin sonuç iddia etme."
    ),
    "stajyer": (
        "Araştırma stajyerisin. Verilen hisseler için fiyat özetini, gösterge kıyasını ve (canlı modda) temel "
        "verileri toplar, kısa ve düz bir rapor yazarsın. Yorum yapma; eksik veriyi açıkça söyle."
    ),
}

BAS_SISTEMI = """Sen bir yatırım araştırma ekibinin başısın. Haftalık oturumu yönetirsin.
Ekip: analist (değerleme ve tez), muhendis (eğitim ve test sonuçlarının yorumu), stajyer (veri ve haber toplama).
Bütçe kısıtlıdır: en fazla {max_gorev} alt görev ver. Önce stajyere veri toplat, sonra analiste tez yazdır,
mühendise yalnız model sonucu varsa danış. Her hisse için tek bir nihai tez ver.

Yatırım tezi (kullanıcıdan): {tez_notu}
Sağlam çekirdek listesi: {cekirdek}. Bu bir güven işaretidir, zorunlu ağırlık değildir. Tezi sorgulamaktan çekinme.

Zaman kuralı: Karar anından sonrasını kullanma. Olasılık kuralı: kanıt yoksa 0,5'e yakın kal.
Yanıtın Türkçe olsun. İşin bitince `tezleri_teslim_et` aracını çağır; başka biçimde teslim etme."""


class EkipTeslimi(BaseModel):
    tezler: list[TezCiktisi] = Field(min_length=1)
    haftalik_not: str
    model_notu: str | None = None


@dataclass
class EkipSonucu:
    teslim: EkipTeslimi
    gorevler: list[dict[str, Any]] = field(default_factory=list)
    girdi_token: int = 0
    cikti_token: int = 0


def _fallback_args(model: str) -> dict[str, Any]:
    # Haiku 5.5'te sunucu tarafı yedek model yok; diğerlerinde kategoriye göre otomatik yedek.
    if "haiku" in model:
        return {}
    return {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}


class Ekip:
    def __init__(
        self,
        ayar: AjanAyarlari,
        piyasa: Piyasa,
        veri: ZamanKilitliVeri,
        db: sqlite3.Connection,
        istemci: Any | None = None,
        egitim_ozeti: str | None = None,
        tez_notu: str = "",
        cekirdek: list[str] | None = None,
    ) -> None:
        self.ayar = ayar
        self.tez_notu = tez_notu
        self.cekirdek = cekirdek or []
        self.piyasa = piyasa
        self.veri = veri
        self.db = db
        self.istemci = istemci if istemci is not None else anthropic.Anthropic()
        self.kutu = AracKutusu(veri, piyasa, db)
        self.egitim_ozeti = egitim_ozeti
        self.gorevler: list[dict[str, Any]] = []
        self.girdi = self.cikti = 0

    # --- alt ajan -------------------------------------------------------------------------
    def _say(self, yanit: Any) -> None:
        u = getattr(yanit, "usage", None)
        if u is not None:
            self.girdi += getattr(u, "input_tokens", 0) or 0
            self.cikti += getattr(u, "output_tokens", 0) or 0

    def alt_gorev(self, rol: str, gorev: str) -> str:
        if rol not in ROLLER:
            return f"Bilinmeyen rol: {rol}"
        model = {"analist": self.ayar.analist, "muhendis": self.ayar.muhendis, "stajyer": self.ayar.stajyer}[rol]
        araclar: list[dict[str, Any]] = list(self.kutu.tanimlar())
        if rol == "analist" and self.veri.canli and self.ayar.web_arama:
            araclar.append({"type": "web_search_20260209", "name": "web_search", "max_uses": 4})
        sistem = ROLLER[rol] + f"\nKarar anı: {self.veri.an.isoformat()}. Piyasa: {self.piyasa.kod.upper()}."
        if rol == "muhendis" and self.egitim_ozeti:
            sistem += "\n\nSon eğitim özeti:\n" + self.egitim_ozeti
        mesajlar: list[dict[str, Any]] = [{"role": "user", "content": gorev}]
        for _ in range(8):
            yanit = self.istemci.beta.messages.create(
                model=model,
                max_tokens=8000,
                system=sistem,
                thinking={"type": "adaptive"},
                output_config={"effort": "low" if rol == "stajyer" else "medium"},
                tools=araclar,
                messages=mesajlar,
                **_fallback_args(model),
            )
            self._say(yanit)
            if yanit.stop_reason == "refusal":
                return "Model bu görevi reddetti."
            mesajlar.append({"role": "assistant", "content": yanit.content})
            if yanit.stop_reason == "pause_turn":
                continue
            if yanit.stop_reason == "tool_use":
                sonuclar = []
                for b in yanit.content:
                    if getattr(b, "type", None) != "tool_use":
                        continue
                    metin, hata = self.kutu.calistir(b.name, b.input if isinstance(b.input, dict) else {})
                    s: dict[str, Any] = {"type": "tool_result", "tool_use_id": b.id, "content": metin}
                    if hata:
                        s["is_error"] = True
                    sonuclar.append(s)
                if sonuclar:
                    mesajlar.append({"role": "user", "content": sonuclar})
                    continue
            return "".join(getattr(b, "text", "") for b in yanit.content if getattr(b, "type", None) == "text")
        return "Alt görev tur sınırına takıldı."

    # --- baş ------------------------------------------------------------------------------
    def _bas_araclari(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "gorev_ver",
                "description": "Bir ekip üyesine görev verir ve raporunu döndürür. rol: analist | muhendis | stajyer.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "rol": {"type": "string", "enum": ["analist", "muhendis", "stajyer"]},
                        "gorev": {"type": "string", "description": "Açık, tek parça görev metni; hisse kodlarını yaz."},
                    },
                    "required": ["rol", "gorev"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
            {
                "name": "tezleri_teslim_et",
                "description": "Oturumu bitirir: her hisse için nihai tez ve haftalık not.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "tezler": {"type": "array", "items": TEZ_SEMASI},
                        "haftalik_not": {"type": "string"},
                        "model_notu": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    },
                    "required": ["tezler", "haftalik_not", "model_notu"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        ]

    def oturum(self, hisseler: list[str]) -> EkipSonucu:
        hisseler = [h.strip().upper() for h in hisseler]
        mod = "CANLI" if self.veri.canli else "ZAMAN KİLİTLİ (web ve temel veri kapalı)"
        mesajlar: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": (
                    f"Karar anı: {self.veri.an.isoformat()}\nMod: {mod}\n"
                    f"Piyasa: {self.piyasa.kod.upper()}, gösterge {self.piyasa.gosterge}\n"
                    f"Hisseler: {', '.join(hisseler)}\n"
                    + (f"Model eğitim özeti mevcut (mühendise sorabilirsin).\n" if self.egitim_ozeti else "")
                    + "Haftalık oturumu yürüt ve tezleri teslim et."
                ),
            }
        ]
        araclar = self._bas_araclari()
        for _ in range(self.ayar.max_gorev + 4):
            yanit = self.istemci.beta.messages.create(
                model=self.ayar.bas,
                max_tokens=16000,
                system=[{"type": "text", "text": BAS_SISTEMI.format(max_gorev=self.ayar.max_gorev, tez_notu=self.tez_notu, cekirdek=", ".join(self.cekirdek) or "-"),
                         "cache_control": {"type": "ephemeral"}}],
                output_config={"effort": self.ayar.efor},
                tools=araclar,
                messages=mesajlar,
                **_fallback_args(self.ayar.bas),
            )  # fmt: skip
            self._say(yanit)
            if yanit.stop_reason == "refusal":
                raise AjanHatasi("Baş ajan isteği reddetti")
            mesajlar.append({"role": "assistant", "content": yanit.content})
            if yanit.stop_reason == "pause_turn":
                continue
            if yanit.stop_reason != "tool_use":
                mesajlar.append({"role": "user", "content": "Lütfen `tezleri_teslim_et` aracıyla teslim et."})
                continue
            sonuclar = []
            for b in yanit.content:
                if getattr(b, "type", None) != "tool_use":
                    continue
                girdi = b.input if isinstance(b.input, dict) else {}
                if b.name == "tezleri_teslim_et":
                    try:
                        teslim = EkipTeslimi.model_validate(girdi)
                    except ValidationError as h:
                        sonuclar.append({"type": "tool_result", "tool_use_id": b.id, "is_error": True,
                                         "content": f"Teslim geçersiz: {h}"})  # fmt: skip
                        continue
                    return EkipSonucu(teslim, self.gorevler, self.girdi, self.cikti)
                if b.name == "gorev_ver":
                    if len(self.gorevler) >= self.ayar.max_gorev:
                        rapor = "Görev bütçesi doldu; eldeki bilgiyle teslim et."
                    else:
                        rapor = self.alt_gorev(girdi.get("rol", ""), girdi.get("gorev", ""))
                        self.gorevler.append({"rol": girdi.get("rol"), "gorev": girdi.get("gorev"), "rapor": rapor})
                    sonuclar.append({"type": "tool_result", "tool_use_id": b.id, "content": rapor})
                else:
                    sonuclar.append({"type": "tool_result", "tool_use_id": b.id, "is_error": True, "content": "Bilinmeyen araç"})
            mesajlar.append({"role": "user", "content": sonuclar})
        raise AjanHatasi("Oturum tur sınırına takıldı; teslim yok")


def teslimi_kaydet(db: sqlite3.Connection, piyasa: Piyasa, veri: ZamanKilitliVeri, sonuc: EkipSonucu, model: str) -> list[int]:
    kimlikler = []
    for t in sonuc.teslim.tezler:
        ar = ArastirmaSonucu(tez=t, giris_fiyati=veri.son_fiyat(piyasa.sembol(t.hisse)), tur_sayisi=0)
        kimlikler.append(tez_kaydet(db, piyasa, ar, veri, model))
    return kimlikler


def gorevleri_json(sonuc: EkipSonucu) -> str:
    return json.dumps(sonuc.gorevler, ensure_ascii=False, indent=1)
