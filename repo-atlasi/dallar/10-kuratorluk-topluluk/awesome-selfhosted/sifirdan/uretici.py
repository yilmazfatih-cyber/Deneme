"""awesome-selfhosted'ın "veri -> README" hattının küçük, özgün bir kopyası.

Gerçek düzen (awesome-selfhosted-data deposu, a54bbea, 2026-11-09):
  software/*.yml   her yazılım ayrı dosya (1360 dosya)
  tags/*.yml       kategoriler; platforms/*.yml diller; licenses*.yml lisanslar
  Makefile         `make awesome_lint`, `make export_markdown` -> hecat aracını çağırır
  .hecat/*.yml     hecat adımları: processors/awesome_lint, exporters/markdown_singlepage ...
Üretilen README.md ayrı bir depoya (awesome-selfhosted/awesome-selfhosted) bot tarafından
itilir; o depoya PR açmak yasaktır.

Burada YAML yerine JSON kullanıyoruz (Python standart kütüphanesinde YAML yok). Akış:
  yukle() -> dogrula() -> readme(ozgur=True) + readme(ozgur=False)

Çalıştır:
  python3 uretici.py veri --cikti cikti --bugun 2026-11-09 [--kati]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ZORUNLU = ("name", "website_url", "description", "licenses", "platforms", "tags")
GEREKSIZ_IFADELER = ("open-source", "open source", "free", "self-hosted", "açık kaynak", "ücretsiz", "kendi sunucunda")
ACIKLAMA_UST_SINIR = 250  # .github/ISSUE_TEMPLATE/addition.md: "shorter than 250 characters"
EN_AZ_ETIKET = 3  # CONTRIBUTING.md: "Any tag must have a minimum of 3 software projects"
UYARI_GUN, HATA_GUN = 186, 365  # .hecat/awesome-lint-strict.yml: last_updated_warn_days / error_days
AYRAC = "---"
TR_ALFABE = "abcçdefgğhıijklmnoöpqrsştuüvwxyz"


@dataclass
class Veri:
    yazilimlar: list[dict]
    etiketler: dict[str, dict]
    platformlar: dict[str, dict]
    lisanslar: dict[str, dict]
    ozgur_olmayan: dict[str, dict]
    metinler: dict[str, str]


@dataclass
class Rapor:
    hatalar: list[str] = field(default_factory=list)
    uyarilar: list[str] = field(default_factory=list)


# --- Yükleme -----------------------------------------------------------------


def _json(yol: Path):
    return json.loads(yol.read_text(encoding="utf-8"))


def _ada_gore(klasor: Path) -> dict[str, dict]:
    """tags/ ve platforms/ dosyalarını 'name' alanına göre sözlüğe çevirir."""
    kayitlar = {}
    for yol in sorted(klasor.glob("*.json")):
        kayit = _json(yol)
        kayitlar[kayit["name"]] = kayit
    return kayitlar


def _lisanslar(yol: Path) -> dict[str, dict]:
    return {kayit["identifier"]: kayit for kayit in _json(yol)}


def yukle(klasor: str | Path) -> Veri:
    k = Path(klasor)
    yazilimlar = []
    for yol in sorted((k / "software").glob("*.json")):
        kayit = _json(yol)
        kayit["_dosya"] = yol.name  # doğrulama mesajlarında ve dosya adı kuralında kullanılır
        yazilimlar.append(kayit)
    metinler = {p.stem: p.read_text(encoding="utf-8").strip() for p in (k / "markdown").glob("*.md")}
    return Veri(
        yazilimlar,
        _ada_gore(k / "tags"),
        _ada_gore(k / "platforms"),
        _lisanslar(k / "licenses.json"),
        _lisanslar(k / "licenses-nonfree.json"),
        metinler,
    )


# --- Yardımcılar -------------------------------------------------------------


def kebab(ad: str) -> str:
    """'Eski Oynatıcı' -> 'eski-oynatici' (dosya adı kuralı: kebab-case)."""
    ad = ad.replace("ı", "i").replace("İ", "I")
    ad = "".join(c for c in unicodedata.normalize("NFD", ad) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", ad.lower()).strip("-")


def kimlik(baslik: str) -> str:
    """GitHub başlık kimliği (bkz. awesome/sifirdan/asama1_ayristirici.py github_kimligi)."""
    return "".join(
        "-" if c == " " else c for c in baslik.lower() if c in " -_" or unicodedata.category(c)[0] in "LMN"
    )


def tr_anahtar(metin: str) -> tuple:
    metin = metin.replace("I", "ı").replace("İ", "i").lower()
    return tuple((0, TR_ALFABE.index(c)) if c in TR_ALFABE else (1, ord(c)) for c in metin)


def ozgur_mu(yazilim: dict, veri: Veri) -> bool:
    """Lisanslarından biri bile özgür değilse yazılım non-free.md'ye gider."""
    return all(lisans in veri.lisanslar for lisans in yazilim.get("licenses", []))


# --- Doğrulama (hecat processors/awesome_lint karşılığı) ---------------------


def dogrula(
    veri: Veri, bugun: dt.date, kati: bool = False, uyari_gun: int = UYARI_GUN, hata_gun: int = HATA_GUN, atla=()
) -> Rapor:
    r = Rapor()
    kullanim = {etiket: 0 for etiket in veri.etiketler}
    for y in veri.yazilimlar:
        yer = y["_dosya"]
        eksik = [alan for alan in ZORUNLU if not y.get(alan)]
        if ozgur_mu(y, veri) and not y.get("source_code_url"):
            eksik.append("source_code_url")
        if eksik:
            r.hatalar.append(f"{yer}: zorunlu alan eksik: {', '.join(eksik)}")
            continue
        if yer != kebab(y["name"]) + ".json":
            r.hatalar.append(f"{yer}: dosya adı '{kebab(y['name'])}.json' olmalı (kebab-case)")
        aciklama = y["description"]
        if len(aciklama) > ACIKLAMA_UST_SINIR:
            r.hatalar.append(f"{yer}: açıklama {len(aciklama)} karakter (en çok {ACIKLAMA_UST_SINIR})")
        if not aciklama.endswith("."):
            r.hatalar.append(f"{yer}: açıklama nokta ile bitmeli")
        for ifade in GEREKSIZ_IFADELER:
            if re.search(r"(?<!\w)" + re.escape(ifade) + r"(?!\w)", aciklama.lower()):
                r.uyarilar.append(f"{yer}: açıklamada gereksiz ifade '{ifade}' (listede olmak bunu zaten söyler)")
        for lisans in y["licenses"]:
            if lisans not in veri.lisanslar and lisans not in veri.ozgur_olmayan:
                r.hatalar.append(f"{yer}: bilinmeyen lisans '{lisans}' (licenses.json'a ekle)")
        for platform in y["platforms"]:
            if platform not in veri.platformlar:
                r.hatalar.append(f"{yer}: bilinmeyen platform '{platform}'")
        for etiket in y["tags"]:
            if etiket in kullanim:
                kullanim[etiket] += 1
            else:
                r.hatalar.append(f"{yer}: bilinmeyen etiket '{etiket}'")
        for alan in ("website_url", "source_code_url", "demo_url", "related_software_url"):
            if y.get(alan, "").startswith("http://"):
                r.uyarilar.append(f"{yer}: {alan} https olmalı")
        _bayatlik(y, yer, bugun, kati, uyari_gun, hata_gun, atla, r)
    for etiket, sayi in kullanim.items():
        if sayi < EN_AZ_ETIKET:
            r.hatalar.append(f"etiket '{etiket}': {sayi} yazılım kullanıyor, en az {EN_AZ_ETIKET} olmalı")
    return r


def _bayatlik(y, yer, bugun, kati, uyari_gun, hata_gun, atla, r: Rapor) -> None:
    """Son güncelleme denetimi: metadata botu (update_metadata) updated_at alanını doldurur."""
    if y.get("source_code_url") in atla:
        return
    if y.get("archived"):
        r.hatalar.append(f"{yer}: depo arşivlenmiş; listeden çıkarılmalı")
        return
    if not y.get("updated_at"):
        r.uyarilar.append(f"{yer}: son güncelleme tarihi bilinmiyor")
        return
    gun = (bugun - dt.date.fromisoformat(y["updated_at"])).days
    if gun > hata_gun and kati:
        r.hatalar.append(f"{yer}: {gun} gündür güncellenmemiş (sınır {hata_gun})")
    elif gun > uyari_gun:
        r.uyarilar.append(f"{yer}: {gun} gündür güncellenmemiş")


# --- Üretim (hecat exporters/markdown_singlepage karşılığı) -------------------


def satir(y: dict) -> str:
    parca = f"- [{y['name']}]({y['website_url']})"
    if y.get("depends_3rdparty"):
        parca += " `⚠`"
    parca += f" - {y['description']}"
    ekler = []
    if y.get("demo_url"):
        ekler.append(f"[Demo]({y['demo_url']})")
    if y.get("source_code_url") and y["source_code_url"] != y["website_url"]:
        ekler.append(f"[Kaynak Kod]({y['source_code_url']})")
    if y.get("related_software_url"):
        ekler.append(f"[İstemciler]({y['related_software_url']})")
    if ekler:
        parca += f" ({', '.join(ekler)})"
    return parca + f" `{'/'.join(y['licenses'])}` `{'/'.join(y['platforms'])}`"


def readme(veri: Veri, ozgur: bool = True) -> str:
    ust = veri.metinler["ust" if ozgur else "non-free-ust"]
    basa = kimlik(ust.splitlines()[0].lstrip("# ").strip())
    secili = [y for y in veri.yazilimlar if ozgur_mu(y, veri) == ozgur]
    gruplar: dict[str, list[dict]] = {}
    for y in secili:  # tek sayfa kipinde yazılım yalnızca İLK etiketinin altında görünür
        gruplar.setdefault(y["tags"][0], []).append(y)
    etiketler = sorted((e for e in veri.etiketler if ozgur or e in gruplar), key=tr_anahtar)
    lisanslar = veri.lisanslar if ozgur else veri.ozgur_olmayan
    basa_don = f"**[`^ başa dön ^`](#{basa})**"

    s = [ust, "", AYRAC, "", "## İçindekiler", "", "- [Yazılımlar](#yazılımlar)"]
    s += [f"  - [{e}](#{kimlik(e)})" for e in etiketler]
    s += ["- [Lisanslar](#lisanslar)", "- [Anti-özellikler](#anti-özellikler)", "", AYRAC, "", "## Yazılımlar"]
    for e in etiketler:
        s += ["", f"### {e}", "", basa_don, "", veri.etiketler[e]["description"], ""]
        ilgili = [i for i in veri.etiketler[e].get("related_tags", []) if i in etiketler]
        if ilgili:
            s += ["_İlgili: " + ", ".join(f"[{i}](#{kimlik(i)})" for i in ilgili) + "_", ""]
        s += [satir(y) for y in sorted(gruplar.get(e, []), key=lambda y: tr_anahtar(y["name"]))]
    s += ["", AYRAC, "", "## Lisanslar", "", basa_don, ""]
    s += [f"- `{k}` - [{d['name']}]({d['url']})" for k, d in sorted(lisanslar.items(), key=lambda x: x[0].lower())]
    s += ["", AYRAC, "", "## Anti-özellikler", "", "- `⚠` - Kullanıcının denetimi dışındaki bir hizmete bağımlı."]
    if ozgur and veri.metinler.get("alt"):
        s += ["", AYRAC, "", veri.metinler["alt"]]
    return "\n".join(s) + "\n"


# --- Komut satırı -------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="JSON veriden README.md ve non-free.md üretir")
    ap.add_argument("veri", help="software/, tags/, platforms/, markdown/ klasörlerini içeren dizin")
    ap.add_argument("--cikti", default="cikti")
    ap.add_argument("--bugun", default=dt.date.today().isoformat(), help="YYYY-AA-GG (testler için sabitlenir)")
    ap.add_argument("--kati", action="store_true", help="günlük 'bakımsız proje' taraması gibi: 365 gün = hata")
    arg = ap.parse_args(argv)

    veri = yukle(arg.veri)
    rapor = dogrula(veri, dt.date.fromisoformat(arg.bugun), kati=arg.kati)
    for u in rapor.uyarilar:
        print(f"[uyarı] {u}", file=sys.stderr)
    for h in rapor.hatalar:
        print(f"[hata] {h}", file=sys.stderr)
    if rapor.hatalar:
        return 1
    cikti = Path(arg.cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    (cikti / "README.md").write_text(readme(veri, ozgur=True), encoding="utf-8")
    (cikti / "non-free.md").write_text(readme(veri, ozgur=False), encoding="utf-8")
    ozgur = sum(ozgur_mu(y, veri) for y in veri.yazilimlar)
    print(f"{ozgur} özgür + {len(veri.yazilimlar) - ozgur} özgür olmayan yazılım -> {cikti}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
