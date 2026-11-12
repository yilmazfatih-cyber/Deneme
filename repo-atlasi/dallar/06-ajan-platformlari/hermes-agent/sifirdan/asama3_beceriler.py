"""Aşama 3 — Beceriler (skills): ajanın yordamsal hafızası, SKILL.md dosyaları olarak.

Gerçek karşılıkları: tools/skills_tool.py (skills_list, skill_view — kademeli açılım),
tools/skill_manager_tool.py (skill_manage — ajanın beceri yazması), tools/skills_guard.py
(kurulum/yazma taraması), agent/skill_utils.py (frontmatter), skills/ (paketle gelen beceriler).

Kademeli açılım (progressive disclosure):
  1. Sistem isteminde yalnızca "ad: açıklama" listesi durur (ucuz).
  2. Model bir beceriye ihtiyaç duyunca skill_view ile tam metni çağırır (gerektiğinde pahalı).
Biçim agentskills.io standardına uyar: klasör/SKILL.md, başında '---' arasında name ve description.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from asama1_hafiza import atomik_yaz, tehdit_tara
from asama2_araclar import registry, tool_error

AD_KALIBI = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
ACIKLAMA_SINIRI = 1024


def parse_frontmatter(metin: str) -> tuple[dict[str, str], str]:
    """'---' satırları arasındaki basit 'anahtar: değer' satırlarını okur (YAML'ın küçük bir alt kümesi)."""
    if not metin.startswith("---\n"):
        return {}, metin
    son = metin.find("\n---", 4)
    if son < 0:
        return {}, metin
    meta = {}
    for satir in metin[4:son].splitlines():
        anahtar, ayrac, deger = satir.partition(":")
        if ayrac and anahtar.strip():
            meta[anahtar.strip()] = deger.strip().strip("\"'")
    return meta, metin[son + 4 :].lstrip("\n")


class SkillStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def _klasor(self, ad: str) -> Path | None:
        for skill_md in self.root.rglob("SKILL.md"):
            if skill_md.parent.name == ad:
                return skill_md.parent
        return None

    def list(self) -> list[dict[str, str]]:
        """1. kademe: yalnızca ad + açıklama (gövde YOK)."""
        sonuc = []
        for skill_md in sorted(self.root.rglob("SKILL.md")) if self.root.exists() else []:
            meta, _ = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
            goreli = skill_md.parent.relative_to(self.root).parts
            sonuc.append(
                {
                    "name": meta.get("name", skill_md.parent.name),
                    "description": meta.get("description", ""),
                    "category": goreli[0] if len(goreli) > 1 else "",
                }
            )
        return sonuc

    def view(self, ad: str) -> dict[str, Any]:
        """2. kademe: tam içerik + yanındaki destek dosyalarının listesi."""
        klasor = self._klasor(ad)
        if klasor is None:
            return {"success": False, "error": f"beceri bulunamadı: {ad}", "mevcut": [s["name"] for s in self.list()]}
        dosyalar = sorted(str(p.relative_to(klasor)) for p in klasor.rglob("*") if p.is_file() and p.name != "SKILL.md")
        return {
            "success": True,
            "name": ad,
            "content": (klasor / "SKILL.md").read_text(encoding="utf-8"),
            "files": dosyalar,
        }

    def _denetle(self, ad: str, icerik: str) -> str | None:
        if not AD_KALIBI.match(ad):
            return "ad küçük harf, rakam ve tire içermeli (en çok 64 karakter)"
        meta, govde = parse_frontmatter(icerik)
        if meta.get("name") != ad or not meta.get("description"):
            return "SKILL.md başında name (klasör adıyla aynı) ve description içeren frontmatter olmalı"
        if len(meta["description"]) > ACIKLAMA_SINIRI:
            return f"description en çok {ACIKLAMA_SINIRI} karakter olmalı"
        if not govde.strip():
            return "beceri gövdesi boş olamaz"
        if tehdit := tehdit_tara(icerik):
            return f"içerik güvenlik taramasına takıldı ({tehdit})"
        return None

    def create(self, ad: str, icerik: str, kategori: str = "") -> dict[str, Any]:
        if hata := self._denetle(ad, icerik):
            return {"success": False, "error": hata}
        if self._klasor(ad) is not None:
            return {"success": False, "error": f"{ad} zaten var; değiştirmek için action='patch' kullan"}
        if kategori and not AD_KALIBI.match(kategori):
            return {"success": False, "error": "geçersiz kategori"}
        hedef = (self.root / kategori / ad).resolve()
        if self.root.resolve() not in hedef.parents:  # yol kaçışı (../) olmasın
            return {"success": False, "error": "beceri kökünün dışına yazılamaz"}
        atomik_yaz(hedef / "SKILL.md", icerik)
        return {"success": True, "path": str(hedef.relative_to(self.root.resolve()) / "SKILL.md")}

    def patch(self, ad: str, eski: str, yeni: str) -> dict[str, Any]:
        klasor = self._klasor(ad)
        if klasor is None:
            return {"success": False, "error": f"beceri bulunamadı: {ad}"}
        metin = (klasor / "SKILL.md").read_text(encoding="utf-8")
        if not eski or metin.count(eski) != 1:
            return {"success": False, "error": "old_string dosyada tam olarak bir kez geçmeli"}
        yeni_metin = metin.replace(eski, yeni)
        if hata := self._denetle(ad, yeni_metin):
            return {"success": False, "error": hata}
        atomik_yaz(klasor / "SKILL.md", yeni_metin)
        return {"success": True}

    def delete(self, ad: str) -> dict[str, Any]:
        klasor = self._klasor(ad)
        if klasor is None:
            return {"success": False, "error": f"beceri bulunamadı: {ad}"}
        shutil.rmtree(klasor)
        return {"success": True}

    def index_for_prompt(self, sinir: int = 1500) -> str:
        """Sistem istemine giren dizin. Uzun açıklamalar kırpılır; ayrıntı skill_view'dadır."""
        satirlar = [f"- {s['name']}: {s['description'][:120]}" for s in self.list()]
        metin = "\n".join(satirlar)
        return metin if len(metin) <= sinir else metin[:sinir].rsplit("\n", 1)[0] + "\n- …"


def _skill_manage(args: dict[str, Any], skill_store: SkillStore | None = None, **_: Any) -> Any:
    if skill_store is None:
        return tool_error("beceri deposu kapalı")
    eylem, ad = args.get("action"), args.get("name", "")
    if eylem == "create":
        return skill_store.create(ad, args.get("content", ""), args.get("category", ""))
    if eylem == "patch":
        return skill_store.patch(ad, args.get("old_string", ""), args.get("new_string", ""))
    if eylem == "delete":
        return skill_store.delete(ad)
    return tool_error(f"bilinmeyen eylem: {eylem}")


registry.register(
    "skills_list",
    "skills",
    {
        "description": "Kurulu becerileri ad ve açıklamalarıyla listeler.",
        "parameters": {"type": "object", "properties": {}},
    },
    lambda args, skill_store=None, **_: {"skills": skill_store.list() if skill_store else []},
)
registry.register(
    "skill_view",
    "skills",
    {
        "description": "Bir becerinin tam talimatlarını getirir. İşe başlamadan önce ilgili beceriyi oku.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
    },
    lambda args, skill_store=None, **_: skill_store.view(args["name"]) if skill_store else tool_error("kapalı"),
)
registry.register(
    "skill_manage",
    "skills",
    {
        "description": "Yeniden kullanılabilir bir yöntemi beceri olarak kaydet (create), düzelt (patch) ya da sil.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "patch", "delete"]},
                "name": {"type": "string"},
                "content": {"type": "string", "description": "Tam SKILL.md (frontmatter dahil)"},
                "category": {"type": "string"},
                "old_string": {"type": "string"},
                "new_string": {"type": "string"},
            },
            "required": ["action", "name"],
        },
    },
    _skill_manage,
)
